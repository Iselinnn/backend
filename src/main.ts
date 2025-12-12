import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import session from 'express-session';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Log environment variables (without exposing sensitive data)
  console.log('APP_URL:', process.env.APP_URL);
  console.log('STEAM_API_KEY:', process.env.STEAM_API_KEY ? 'SET' : 'NOT SET');
  
  // Enable CORS for Flutter Web
  app.enableCors({
    origin: true, // Allow all origins in development
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Important: allow credentials (cookies)
  });

  // Configure sessions for Steam auth
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'super-secret-key-12345',
      resave: false,
      saveUninitialized: false,
      name: 'csmarket.sid', // Custom session name
      cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax', // Allow cookies to be sent in cross-site requests
        // Don't set domain - let it default to the current domain
      },
    }),
  );
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
