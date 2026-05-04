
# OnionPeeler

A full-stack dashboard for crawling and discovering sites on the Tor network. OnionPeeler allows you to monitor discovery in real-time, manage crawl depth, and build a local database of `.onion` services.

<img width="1920" height="1080" alt="chrome_vWuj8x8VtR" src="https://github.com/user-attachments/assets/34176dac-b88c-4e04-adde-54b3d49daa3b" />

## Features

- **Real-Time Monitoring**: Live feed of URLs being crawled and sites discovered via WebSockets.
- **Smart Discovery**: Prioritizes external links to maximize network coverage and prevent getting stuck on large directory sites.
- **Link Unwrapping**: Automatically detects and follows redirect patterns (like `url=http...`) to find direct onion addresses.
- **Configurable Crawls**: Adjust depth and delay between requests to manage resource usage and stay under the radar.
- **Data Persistence**: Stores titles, content snippets, and discovered links in MongoDB.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, Mongoose.
- **Crawling**: `tor-request` + `cheerio`.
- **Communication**: WebSockets (ws).

## Prerequisites

1.  **Tor**: You must have the Tor service running locally. 
    - If using **Tor Browser**, the default SOCKS port is `9150`.
    - If using the **Tor Expert Bundle** or service, the default is `9050`.
2.  **MongoDB**: A running instance of MongoDB.
3.  **Node.js**: Version 16 or higher recommended.

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/OnionPeeler.git
cd OnionPeeler
```

### 2. Configure the Backend
Navigate to the `backend` folder and create a `.env` file:
```bash
cd backend
npm install
```

Example `.env`:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/onionpeeler
TOR_SOCKS_PORT=9150
TOR_CONTROL_PORT=9151
```

### 3. Setup the Frontend
Open a new terminal, navigate to the `frontend` folder:
```bash
cd frontend
npm install
```

### 4. Run the App
**Start Backend:**
```bash
# In /backend
npm run dev
```

**Start Frontend:**
```bash
# In /frontend
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

## Usage Tips

- **Seeds**: If you don't provide a target URL, the crawler starts with a set of default seeds (The Hidden Wiki, Ahmia, etc.).
- **Depth**: A depth of `1` crawls the target and all links found on it. Increasing this can quickly lead to thousands of discovered sites.
- **Database**: Use the "Clear Database" button in the settings if you want to start a fresh crawl from scratch.

## Disclaimer

This tool is for educational and research purposes only. Ensure you comply with all local laws and the terms of service of any network you access.
