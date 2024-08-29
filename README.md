# Smart Waste Management
![Smart Waste Management Dashboard](smart-waste-management/gallery/4_Web_app_dashboard.png)

This project is an IoT-based system designed to enhance waste management efficiency. It is part of the final assignment program at VERN' University. It uses sensors to monitor waste bin fill levels, detect environmental conditions, and optimize waste collection routes. The core components include a Raspberry Pi, which processes sensor data, and a web application for real-time data visualization and management.

## Key Features
- **Real-Time Monitoring**: Sensors track fill levels, temperature, tilt, and detect fire or smoke in waste bins.
- **Route Optimization**: The system computes the most efficient waste collection routes based on sensor data.
- **Web Application**: A user interface to manage bins, view real-time data, and generate reports.
- **Scalability**: The system can easily scale to accommodate more bins and sensors.

## Project Structure
- **sensors/**: Contains Raspberry Pi script responsible for gathering sensor data and sending it to the server.
- **web-app/**: A web application that displays real-time data, manages users, and optimizes waste collection routes.

## How It Works
1. **Sensors**: Measure waste bin fill levels, temperature, tilt, and detect fire or smoke.
2. **Raspberry Pi**: Central unit that processes sensor data and communicates with the web application.
3. **Web Application**: Displays real-time data, manages users, and optimizes collection routes.

## Technologies Used
- **Hardware**: Raspberry Pi, Ultrasonic sensors, Temperature sensors, Tilt sensors, GPS module, RFID reader.
- **Software**: Python, Node.js, Express.js, SQLite.
