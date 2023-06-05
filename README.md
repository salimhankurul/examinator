## Front End → [Click Here](https://github.com/salimhankurul/examinator-client)

## Examinator

Examinator is an online examination platform that offers functionalities for users to manage exams, submit answers, and calculate scores. The platform supports different user types, such as administrators, teachers, and students.

## Main Features

### User Authentication:

`Users can register, sign in, and sign out. Password reset functionality is also available.`

### Exams:

`Teachers can create exams, specifying details like questions, options, and duration. Students can join exams, submit answers, and view their scores.`

## Main Functions

> ### createExam:

`This function is responsible for creating an exam. It performs various validations, checks if necessary environment variables are set, verifies user authentication and authorization, processes exam data, generates unique identifiers for questions and options, stores the exam questions in an S3 bucket, saves the exam details in a DynamoDB table, generates a token for finishing the exam, and starts a background process using the token.`

> ### finishExam:

 `This function handles the process of finishing an exam. It validates the input payload, verifies the finisher token, retrieves the exam details from a DynamoDB table, retrieves the exam questions from an S3 bucket, retrieves the exam sessions from the database, calculates the exam results for each session, updates the user's information in the database, and returns a response indicating the success of the process.`

> ### joinExam:

`This function handles the process of joining an exam. It validates the access token and the input payload, checks if the user is enrolled in the course related to the exam, retrieves the exam questions from an S3 bucket, randomizes them if required, checks if the user has already joined the exam, creates a new exam session if necessary, generates a token for the session, updates the necessary tables, and returns the token, exam questions, and exam details to the user.`

> ### submitToExam:

`This function handles the process of submitting answers to an exam. It validates the access token and the input payload, checks if the exam is still ongoing, and retrieves the exam questions from an S3 bucket. It then calculates the score and updates the user's exam session with the submitted answers and score. Finally, it returns a success response if the process completes without errors or an appropriate error response if any errors occur.`

## Error Handling

Examinator uses a custom Response class for consistent error handling, providing meaningful feedback to the client with appropriate status codes and messages.