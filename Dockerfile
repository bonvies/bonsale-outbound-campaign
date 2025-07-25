FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package* ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on (REST API)
EXPOSE 3020

# Command to run the application
CMD ["node", "./bin/www"]