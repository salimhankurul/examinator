export interface ResponseArguments<T> {
  statusCode: number
  message?: string
  addons?: T | undefined
  body?: T | undefined
}

export interface ExaminatorResponse {
  statusCode: number
  body: string
  headers: object
}

export class Response<T = unknown> extends Error {
  public readonly code: number

  public readonly statusCode: number

  public readonly message: string

  public body?: T = undefined

  public addons?: T = undefined

  constructor(errorArguments: ResponseArguments<T>) {
    super('')
    const { message, statusCode, addons, body } = errorArguments
    this.statusCode = statusCode

    this.addons = addons || ({} as T)
    this.message = message || ''

    this.body = body
    Object.setPrototypeOf(this, Response.prototype)
  }

  get response(): ExaminatorResponse {
    const body = this.body || { message: this.message, ...this.addons }

    // @ts-ignore
    body.success = this.statusCode >= 200 && this.statusCode < 300 ? true : false

    return {
      statusCode: this.statusCode,
      body: JSON.stringify(body),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/json',
      },
    }
  }
}
