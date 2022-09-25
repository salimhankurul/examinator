import axios from 'axios'
import { nanoid } from 'nanoid'
import { execSync } from 'child_process'

export const main = async (event: any, context: any) => {
  try {
    return {
      statusCode: 202,
      headers: {},
      body: JSON.stringify({ event, context }),
    }
  } catch (err) {
    return {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ err: err.message }),
    }
  }
}
