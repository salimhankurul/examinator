import crypto from 'crypto'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { Response } from './response'
import { UserMetaData, userType as userTypeSchema } from './types'
import { validateSessionToken } from './Modules/authorization'

const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = process.env

export const test = async (event: APIGatewayProxyEventV2, context: Context) => {
  try {
    const input = JSON.parse(event.body || '{a}')

    const _token = event.headers['_token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    return new Response({ statusCode: 200, body: auth }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}
