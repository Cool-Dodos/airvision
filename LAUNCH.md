#  Launch Instructions - AirVision Global

This guide provides a step-by-step walkthrough to get the **AirVision Global AQI Monitor** running on your local machine.

##  Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18.x or v20.x recommended)
- **npm** (comes with Node.js)
- **Git**

---

##  Project Structure

- `/server`: Express.js backend (handles data fetching & MongoDB)
- `/client-ng`: Angular frontend (handles the 3D globe & UI)

---

##  Step-by-Step Setup

### 1. Clone the Project
```bash
git clone https://github.com/Cool-Dodos/airvision.git
cd airvision
```

### 2. Backend Setup (Server)
The backend manages real-time data from the WAQI API and interacts with the database.
```bash
cd server
npm install
```
*Note: The `.env` file is already configured with the cloud database connection and API tokens for immediate use.*

### 3. Frontend Setup (Client)
Open a **new terminal** window and navigate to the frontend folder.
```bash
cd client-ng
npm install
```

---

##  Running the Application

### Method A: Running Separately (Recommended)
This is the most reliable way to monitor logs for both parts.

1. **Terminal 1 (Backend):**
   ```bash
   cd server
   node index.js
   ```
2. **Terminal 2 (Frontend):**
   ```bash
   cd client-ng
   npx ng serve
   ```

### Method B: Root Command
If you are in the root `airvision` folder, you can try running both at once:
```bash
npm run dev
```

---

##  Accessing the App

Once the frontend terminal shows a successful compilation:
1. Open your browser.
2. Navigate to: **[http://localhost:4200](http://localhost:4200)**

---

##  Troubleshooting

- **Port Conflicts:** Ensure ports `5000` (Backend) and `4200` (Frontend) are not being used by other apps.
- **Angular CLI:** If `ng` commands fail, use `npx ng` to use the local version within the project.
- **Node Modules:** If you see "Module not found" errors, try deleting the `node_modules` folder and running `npm install` again.

---

*Happy Monitoring!* 🌍💨
