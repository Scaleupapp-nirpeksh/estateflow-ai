#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// File paths
const envExamplePath = path.join(__dirname, '../.env.example');
const envPath = path.join(__dirname, '../.env');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('\x1b[33m%s\x1b[0m', '.env file already exists. Do you want to overwrite it? (y/n)');
  rl.question('', (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('Operation cancelled.');
      rl.close();
      return;
    }
    createEnvFile();
  });
} else {
  createEnvFile();
}

function createEnvFile() {
  // Read the .env.example file
  let envExample;
  try {
    envExample = fs.readFileSync(envExamplePath, 'utf8');
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Error reading .env.example file:', err.message);
    rl.close();
    return;
  }

  // Generate a secure JWT secret
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  // Replace the JWT_SECRET placeholder
  let envContent = envExample.replace('your_jwt_secret_key_here', jwtSecret);

  // Write the .env file
  try {
    fs.writeFileSync(envPath, envContent);
    console.log('\x1b[32m%s\x1b[0m', '.env file created successfully!');
    console.log('\x1b[36m%s\x1b[0m', 'Remember to update the following values in your .env file:');
    console.log('- OPENAI_API_KEY');
    console.log('- AWS credentials (if using S3 for document storage)');
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Error writing .env file:', err.message);
  }

  rl.close();
}

rl.on('close', () => {
  process.exit(0);
});