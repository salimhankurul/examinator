
export interface CustomErrorArguments<T> {
  message: string
  statusCode: number
  addons?: T | undefined
}

export interface ExaminatorResponse {
  statusCode: number
  body: string
}

export class CustomError<T = unknown> extends Error {
  public readonly code: number

  public readonly statusCode: number

  public addons?: T = undefined

  public readonly message: string

  public title?: string = 'Error Message'

  constructor(errorArguments: CustomErrorArguments<T>) {
    super('')
      const { message, statusCode, addons } = errorArguments
      this.message = message
      this.statusCode = statusCode
      this.addons = addons

      Object.setPrototypeOf(this, CustomError.prototype)
    
  }

  get response(): ExaminatorResponse {
    return {
      statusCode: this.statusCode,
      body: JSON.stringify({
        message: this.message,
        ...this.addons,
      }),
    }
  }
}
