import crypto from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { decode, JwtPayload, sign, verify } from 'jsonwebtoken'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { loginInput, registerInput } from './models'
import { createResponse } from './utils'
import { CustomError } from './custom-error'
import { User, userType as userTypeSchema} from './types'
import { validateToken } from './auth'

const { ACCESS_TOKEN_SECRET } = process.env

export const test = async (event: APIGatewayProxyEventV2, context: Context) => {
    try {    
        const input = JSON.parse(event.body || '{}')

        const _token = event.headers['_token']

        const auth = validateToken(_token, ACCESS_TOKEN_SECRET)

        if (auth.error) {
          throw new CustomError({ statusCode: 400, message: 'There has been a problem while verifying your access token.',  addons: { tokenError: auth.error } })
        }

        return createResponse(200, { auth })
    } catch (error) {
      return error instanceof CustomError ? error.response : new CustomError({ statusCode: 400, message: 'Generic Examinator Error',  addons: { error: error.message } }).response
    }
  }
