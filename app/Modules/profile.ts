import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { v4 as uuidv4 } from 'uuid'
import { createSession, terminateSession, validateSessionToken } from './authorization'
import { updateProfileInput } from '../models'
import { ExaminatorResponse, Response } from '../response'
import { UserProfileItem } from '../types'

const ProfileTable = 'ProfileTable'

const { ACCESS_TOKEN_SECRET } = process.env

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

export const updateProfile = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = updateProfileInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const _token = event.headers['_token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const oldProfile = await dynamo.send(
      new GetCommand({
        TableName: ProfileTable,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const profileInfo: UserProfileItem = oldProfile.Item as UserProfileItem

    if (!profileInfo) {
      throw new Response({ statusCode: 404, message: 'Database GET error, please contact admin !' })
    }

    const newProfileItem: UserProfileItem = {
      ...profileInfo,
      ..._input.data,
    }

    const newProfile = await dynamo.send(
      new PutCommand({
        TableName: ProfileTable,
        Item: newProfileItem,
      }),
    )

    if (!newProfile.$metadata || newProfile.$metadata.httpStatusCode !== 200) {
      throw new Response({ statusCode: 400, message: 'Database PUT Error, please contact admin !', addons: { error: newProfile } })
    }

    return new Response({ statusCode: 200, body: { success: true, newProfile } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

export const getProfile = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['_token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const profileDB = await dynamo.send(
      new GetCommand({
        TableName: ProfileTable,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const data: UserProfileItem = profileDB.Item as UserProfileItem

    return new Response({ statusCode: 200, body: { success: true, data } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
