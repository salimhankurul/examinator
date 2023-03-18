import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { sign, verify as JWTVerify } from 'jsonwebtoken'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { Response, ExaminatorResponse } from '../response'
import { ValidateTokenResponse, TokenMetaData, SessionTableItem } from '../types'

const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = process.env
const ACCESS_TOKEN_TTL = 300
const REFRESH_TOKEN_TTL = 600
const SESSION_TABLE = 'SessionTable'

const client = new DynamoDBClient({})

const dynamo = DynamoDBDocumentClient.from(client)

// *******************************
// *******************************
// *********** TOKEN *************
// *******************************
// *******************************

export const verifyToken = (token: string, secret: string): ValidateTokenResponse => {
  try {
    if (!secret || !token) {
      throw new Response({ statusCode: 403, message: 'There has been problem whit your token', addons: { errorCode: 0xff897 } })
    }

    return { tokenMetaData: JWTVerify(token, secret) as TokenMetaData }
  } catch (error) {
    return {
      error: error.message,
    }
  }
}

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
      TableName: SESSION_TABLE,
      Item: sessionItem,
    }),
  )

  return { accessToken, refreshToken }
}

export const terminateSession = async (_token: string, targetUserId: string): Promise<void> => {
  const { tokenMetaData, error } = verifyToken(_token, ACCESS_TOKEN_SECRET)

  if (error) {
    throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your token.', addons: { tokenError: error } })
  }

  if (tokenMetaData.userId !== targetUserId && tokenMetaData.userType !== 'admin') {
    throw new Response({ statusCode: 403, message: 'You are not authorized to terminate this session.' })
  }

  const dynamoReq = await dynamo.send(
    new DeleteCommand({
      TableName: SESSION_TABLE,
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
  const { tokenMetaData, error } = verifyToken(_token, secret)

  if (error) {
    throw new Response({ statusCode: 403, message: 'There has been a problem while authorizing your token.', addons: { tokenError: error } })
  }

  const dynamoReq = await dynamo.send(
    new GetCommand({
      TableName: SESSION_TABLE,
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

    const _token = event.headers['_token'] // refresh token
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
