import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { v4 as uuidv4 } from 'uuid'
import { createSession, terminateSession, validateSessionToken } from './authorization'
import { updateProfileInput } from '../models'
import { ExaminatorResponse, Response } from '../response'
import { UsersTableItem } from '../types'
import { usersTableName } from '../utils'

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

    const _token = event.headers['access-token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const _oldUser = await dynamo.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const oldUser = _oldUser.Item as UsersTableItem

    if (!oldUser) {
      throw new Response({ statusCode: 404, message: 'Database GET error, please contact admin !' })
    }

    const newProfileItem: UsersTableItem = {
      ...oldUser,
      ..._input.data,
    }

    const newProfile = await dynamo.send(
      new PutCommand({
        TableName: usersTableName,
        Item: newProfileItem,
        ConditionExpression: 'attribute_exists(userId)',
      }),
    )

    if (!newProfile.$metadata || newProfile.$metadata.httpStatusCode !== 200) {
      throw new Response({ statusCode: 400, message: 'Database PUT Error, please contact admin !', addons: { error: newProfile } })
    }

    return new Response({ statusCode: 200, body: { success: true, profile: newProfileItem } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

export const getProfile = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['access-token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const _user = await dynamo.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const user = _user.Item as UsersTableItem

    if (!user) {
      throw new Response({ statusCode: 404, message: 'Couldnt find any user with this id', addons: { userId: auth.userId } })
    }

    return new Response({ statusCode: 200, body: { success: true, profile: user } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
