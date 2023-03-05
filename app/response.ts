export interface ResponseArguments<T> {
  statusCode: number
  message?: string
  addons?: T | undefined
  body?: T | undefined
}

export interface ExaminatorResponse {
  statusCode: number
  body: string
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
    
    this.addons = addons || {} as T
    this.message = message || ''
    
    this.body = body
    Object.setPrototypeOf(this, Response.prototype)
  }

  get response(): ExaminatorResponse {
    const body = this.body || { message: this.message, ...this.addons }
    return {
      statusCode: this.statusCode,
      body: JSON.stringify(body),
    }
  }
}
