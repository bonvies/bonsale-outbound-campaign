FROM node:16

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

# Expose the outboundCampaigm WebSocket server port
EXPOSE 3021

# Expose the projectOutbound WebSocket server port
EXPOSE 3022

# Command to run the application
CMD ["node", "./bin/www"]