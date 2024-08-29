# Smart Waste Management
![Smart Waste Management Dashboard](gallery/4_Web_app_dashboard.png)

This project was developed to demonstrate the use of the Internet of Things (IoT) in waste management. It is part of the final assignment program at VERN' University. It uses sensors to monitor waste bin fill levels, detect environmental conditions, and optimize waste collection routes. The core components include a Raspberry Pi, which processes sensor data, and a web application for real-time data visualization and management.

## Technologies Used
**Raspberry Pi 4B**:
- **Processor**: Quad-core Cortex-A72 (ARM v8) 64-bit SoC @ 1.5GHz
- **RAM**: 4GB LPDDR4-3200 SDRAM
- **Connectivity**: Wi-Fi, Bluetooth 5.0, Gigabit Ethernet
- **GPIO**: 40-pin GPIO header for sensor connections
- **Operating System**: Raspbian OS
  
**Sensors**:
- **Ultrasonic Sensor (HC-SR04)**: Used for measuring the fill level of the waste bins.
- **Temperature and Humidity Sensor (DS18B20)**: Monitors the temperature inside the bins.
- **Tilt Sensor**: Detects the tilt of the bin, indicating if the bin has been overturned.
- **Smoke and Gas Sensor (MQ-2)**: Detects the presence of smoke and gases.
- **Flame Sensor (KY-026)**: Detects the presence of flames.
- **RFID Reader (MFRC-522)**: Identifies bins via RFID tags.
- **GPS Module (u-blox NEO-6M)**: Precisely locates bins.
  
**Web Application**:
- **Backend**: Node.js, Express.js
- **Frontend**: HTML, CSS, JavaScript, Google Maps API
- **Database**: SQLite
  
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
- **Hardware**: Raspberry Pi, Ultrasonic sensor, Temperature sensor, Tilt sensor, GPS module, RFID reader.
- **Software**: Python, Node.js, Express.js, SQLite.
