# Examinator

Examinator is an online examination platform that offers functionalities for users to manage exams, submit answers, and calculate scores. The platform supports different user types, such as administrators, teachers, and students.

  ## Main Features

   ### User Authentication: 
    Users can register, sign in, and sign out. Password reset functionality is also available.
   ### User Profiles: 
    Users can update their profile information and manage the courses they are enrolled in.
   ### Exams: 
    Teachers can create exams, specifying details like questions, options, and duration. Students can join exams, submit answers, and view their scores.
   
   
  ## Functions
   ### register: 
    Handles user registration with input validation.
   ### signIn: 
     Authenticates a user and generates access and refresh tokens.
   ### signOut: 
    Logs a user out by removing their session information.
   ### updateProfile: 
    Updates a user's profile information and enrolled courses.
   ### createExam: 
    Creates a new exam with specified details.
   ### submitAnswer: 
    Allows users to submit answers for specific questions.
   ### joinExam: 
    Enables users to join an exam.
   ### finisherExam: 
    Finalizes an exam and calculates the user's score.
    
   ## Error Handling

  Examinator uses a custom Response class for consistent error handling, providing meaningful feedback to the client with appropriate status codes and messages.
