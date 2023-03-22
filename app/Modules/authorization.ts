import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { sign, verify } from 'jsonwebtoken'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { Response, ExaminatorResponse } from '../response'
import { TokenMetaData, SessionTableItem, ExamTicketTokenMetaData, FinishExamTokenMetaData } from '../types'
import { userSessionsTableName } from '../utils'

const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = process.env
const ACCESS_TOKEN_TTL = 30000
const REFRESH_TOKEN_TTL = 60000

const client = new DynamoDBClient({})

const dynamo = DynamoDBDocumentClient.from(client)

// *******************************
// *******************************
// ********** SESSION ************
// *******************************
// *******************************

export const createSession = async ({ userId, userType }: any, IP: string) => {
  const tokenData: TokenMetaData = {
    userType,
    userId,
    IP,
  }

  const accessToken = sign(tokenData, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
  const refreshToken = sign(tokenData, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_TTL })

  const sessionItem: SessionTableItem = {
    userId,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  }

  await dynamo.send(
    new PutCommand({
      TableName: userSessionsTableName,
      Item: sessionItem,
    }),
  )

  return { accessToken, refreshToken }
}

export const terminateSession = async (_token: string, targetUserId: string): Promise<void> => {
  let tokenMetaData: TokenMetaData
  try {
    tokenMetaData = verify(_token, ACCESS_TOKEN_SECRET) as TokenMetaData
  } catch (error) {
      throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your token.', addons: { tokenError: error.message } })
  }

  if (tokenMetaData.userId !== targetUserId && tokenMetaData.userType !== 'admin') {
    throw new Response({ statusCode: 403, message: 'You are not authorized to terminate this session.' })
  }

  const dynamoReq = await dynamo.send(
    new DeleteCommand({
      TableName: userSessionsTableName,
      Key: {
        userId: targetUserId,
      },
    }),
  )

  if (!dynamoReq.$metadata || dynamoReq.$metadata.httpStatusCode !== 200) {
    throw new Response({ statusCode: 404, message: 'There has been a problem while terminating your session.' })
  }
}

export const validateSessionToken = async (_token: string, secret: string): Promise<TokenMetaData> => {
  let tokenMetaData: TokenMetaData
  try {
    tokenMetaData = verify(_token, secret) as TokenMetaData
  } catch (error) {
      throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your token.', addons: { tokenError: error.message } })
  }

  const dynamoReq = await dynamo.send(
    new GetCommand({
      TableName: userSessionsTableName,
      Key: {
        userId: tokenMetaData.userId,
      },
    }),
  )

  const sessionItem = dynamoReq.Item as SessionTableItem

  if (!sessionItem || (sessionItem.accessToken !== _token && sessionItem.refreshToken !== _token)) {
    throw new Response({ statusCode: 403, message: 'There has been a problem while validating your token.' })
  }

  return tokenMetaData
}


export const validateExamTicketToken = async (_token: string, secret: string): Promise<ExamTicketTokenMetaData> => {
  try {
    return verify(_token, secret) as ExamTicketTokenMetaData
  } catch (error) {
      throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your exam token.', addons: { tokenError: error.message } })
  }
}

export const validateFinishToken = async (_token: string, secret: string): Promise<FinishExamTokenMetaData> => {
  try {
    return verify(_token, secret) as FinishExamTokenMetaData
  } catch (error) {
      throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your exam token.', addons: { tokenError: error.message } })
  }
}

// *******************************
// *******************************
// ***** LAMBDA HANDLERS  ********
// *******************************
// *******************************

export const refreshToken = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['refresh-token'] // refresh token
    const reqIP = event.requestContext.http.sourceIp

    const tokenMetaData = await validateSessionToken(_token, REFRESH_TOKEN_SECRET)

    if (tokenMetaData.IP !== reqIP) {
      throw new Response({ statusCode: 403, message: 'Token is not created with same IP' })
    }

    const { userId, userType } = tokenMetaData

    const { accessToken, refreshToken } = await createSession({ userId, userType }, reqIP)

    return new Response({ statusCode: 200, body: { accessToken, refreshToken } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
