import crypto from 'crypto'
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { v4 as uuidv4 } from 'uuid'
import { createSession, terminateSession } from './authorization'
import { signInInput, registerInput, signOutInput } from '../models'
import { ExaminatorResponse, Response } from '../response'
import { AuthenticationTableItem, UsersTableItem } from '../types'
import { authenticationsTableName, usersTableName } from '../utils'

const client = new DynamoDBClient({})

const dynamo = DynamoDBDocumentClient.from(client)

const encodePassword = (password: string) => crypto.createHash('sha3-512').update(password).digest('hex')

// *******************************
// *******************************
// ***** LAMBDA HANDLERS  ********
// *******************************
// *******************************

export const signUp = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = registerInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { email, password, userType } = _input.data

    const newId = uuidv4().replace(/-/g, '')

    try {
      const Item: AuthenticationTableItem = {
        email,
        password: encodePassword(password),
        userId: newId,
      }
      await dynamo.send(
        new PutCommand({
          TableName: authenticationsTableName,
          Item,
          ConditionExpression: 'attribute_not_exists(email)',
        }),
      )
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new Response({ statusCode: 400, message: 'User with this email already exists !', addons: { email } })
      } else {  
        throw new Response({ statusCode: 400, message: 'Database Error, please contact admin !', addons: { error } })
      }
    }

    const profileDB = await dynamo.send(
      new PutCommand({
        TableName: usersTableName,
        Item: {
          userId: newId,
          userType,
          email,
        },
      }),
    )

    if (profileDB.$metadata.httpStatusCode !== 200) {
      throw new Response({ statusCode: 400, message: 'Database Error, please contact admin !', addons: { error: profileDB } })
    }

    const session = await createSession({ userId: newId, userType }, event.requestContext.http.sourceIp)

    return new Response({ statusCode: 200, body: session }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

export const signIn = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = signInInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { email, password: recivedPassword } = _input.data

    const authDB = await dynamo.send(
      new GetCommand({
        TableName: authenticationsTableName,
        Key: {
          email,
        },
      }),
    )

    const authInfo = authDB.Item as AuthenticationTableItem

    if (!authInfo || !authInfo.password || authInfo.password !== encodePassword(recivedPassword)) {
      throw new Response({ statusCode: 400, message: 'User with this email does not exist or Incorrect password !' })
    }

    const _user = await dynamo.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          userId: authInfo.userId,
        },
      }),
    )

    const user = _user.Item as UsersTableItem

    if (!user) {
      throw new Response({ statusCode: 400, message: 'Error accured while trying to find user profile' })
    }

    const session = await createSession({ userId: user.userId, userType: user.userType }, event.requestContext.http.sourceIp)

    return new Response({ statusCode: 200, body: { session, profile: user } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

export const signOut = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = signOutInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const _token = event.headers['access-token']

    const res = await terminateSession(_token, _input.data.userId)

    return new Response({ statusCode: 200, body: { success: true, res } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
