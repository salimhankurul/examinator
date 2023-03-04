import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { decode as JWTDecode, JwtPayload, sign, verify as JWTVerify } from 'jsonwebtoken'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { loginInput, registerInput } from './models'
import { createResponse } from './utils'
import { CustomError, ExaminatorResponse } from './custom-error'
import { User, userType as userTypeSchema, VerifyResponse } from './types'

const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = process.env
const ACCESS_TOKEN_TTL = 300
const REFRESH_TOKEN_TTL = 600
const TOKEN_TABLE = 'TokenTable'
const USER_TABLE = 'UserTable'

const client = new DynamoDBClient({})

const dynamo = DynamoDBDocumentClient.from(client)

const encodePassword = (password: string) => crypto.createHash('sha3-512').update(password).digest('hex')

const generateToken = (user: User, IP: string): { accessToken: string; refreshToken: string } => {
  const tokenData = {
    email: user.email,
    type: user.type,
    id: user.id,
    IP,
  }
  const accessToken = sign(tokenData, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
  const refreshToken = sign(tokenData, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_TTL })

  return { accessToken, refreshToken }
}

export const validateToken = (token: string, secret: string): VerifyResponse => {
  try {
    if (!secret) {
      throw new CustomError({ message: 'There has been problem whit token secret, please contact admin', statusCode: 400, addons: { errorCode: 0xff897 } })
    }
    if (!token) {
      throw new CustomError({ message: 'Please provide a valid accessToken', statusCode: 400 })
    }

    return JWTVerify(token, secret)
  } catch (error) {
    return {
      error: error.message,
    }
  }
}

// *******************************
// *******************************
// ******  AUTH HANDLERS  ********
// *******************************
// *******************************

export const register = async (event: APIGatewayProxyEventV2, context: Context) => {
  try {
    const _input = registerInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new CustomError({ message: 'Invalid Input', statusCode: 400, addons: { error: _input.error.issues } })
    }

    const { email, password, userType } = _input.data

    const checkExistingUser = await dynamo.send(
      new GetCommand({
        TableName: USER_TABLE,
        Key: {
          email,
        },
      }),
    )

    if (checkExistingUser.Item) {
      throw new CustomError({ message: 'User already exists', statusCode: 400, addons: { error: checkExistingUser } })
    }

    const newId = crypto.randomBytes(16).toString('hex')

    const user: User = {
      type: userType,
      email,
      id: newId,
      password: encodePassword(password),
    }

    const dynamoReq = await dynamo.send(
      new PutCommand({
        TableName: USER_TABLE,
        Item: user,
      }),
    )

    if (dynamoReq.$metadata.httpStatusCode !== 200) {
      throw new CustomError({ message: 'Database Error, please contact admin !', statusCode: 400, addons: { error: dynamoReq } })
    }

    const { accessToken, refreshToken } = generateToken(user, event.requestContext.http.sourceIp)

    return createResponse(200, { accessToken, refreshToken, message: 'Successfully registered' })
  } catch (error) {
    return error instanceof CustomError ? error.response : new CustomError({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

export const login = async (event: APIGatewayProxyEventV2, context: Context) => {
  try {
    const _input = loginInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new CustomError({ message: 'Invalid Input', statusCode: 400, addons: { error: _input.error.issues } })
    }

    const { email, password: recivedPassword } = _input.data

    const dynamoReq = await dynamo.send(
      new GetCommand({
        TableName: USER_TABLE,
        Key: {
          email,
        },
      }),
    )

    if (!dynamoReq.Item.password) {
      throw new CustomError({ message: 'User does not have stored password, please report to admin', statusCode: 404 })
    }

    if (dynamoReq.Item.password !== encodePassword(recivedPassword)) {
      throw new CustomError({ message: 'Wrong Password', statusCode: 400 })
    }

    const user: User = dynamoReq.Item as User

    const { accessToken, refreshToken } = generateToken(user, event.requestContext.http.sourceIp)

    return createResponse(200, { accessToken, refreshToken, message: 'Successfully registered' })
  } catch (error) {
    return error instanceof CustomError ? error.response : new CustomError({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

export const refreshToken = async (event: APIGatewayProxyEventV2, context: Context) => {
  try {
    const _token = event.headers['_token']
    const reqIP = event.requestContext.http.sourceIp

    if (!_token) {
      throw new CustomError({ message: 'Invalid Input, please provide a valid token in headers', statusCode: 400, addons: { _token } })
    }

    const { id, type, email, IP, error } = validateToken(_token, REFRESH_TOKEN_SECRET)

    if (error) {
      throw new CustomError({ statusCode: 400, message: 'There has been a problem while validating your token.', addons: { tokenError: error } })
    }
    
    if (IP !== reqIP) {
      throw new CustomError({ statusCode: 400, message: 'Token is not created with same IP' })
    }

    const { accessToken, refreshToken } = generateToken({
      id,
      type,
      email,
    } as User, reqIP)

    return createResponse(200, { accessToken, refreshToken, message: 'Successfully refreshed' })
  } catch (error) {
    return error instanceof CustomError ? error.response : new CustomError({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
