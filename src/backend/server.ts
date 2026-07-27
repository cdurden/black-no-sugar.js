import { createServer } from "http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

// 1. Initialize Express Application Infrastructure
const app = express();
// Middleware to parse incoming JSON request bodies safely
app.use(express.json());

// Serve all static frontend assets (index.html, engine.js, chat.js, etc.) from the root directory
app.use(express.static(process.cwd()));

// Mock historical chat database store for development
const chatHistoryDatabase: Record<string, string[]> = {
  "tech-talk": [
    "Welcome to the tech-talk room archive history baseline.",
    "System reminder: Keep your MVU components isolated and pure.",
    "Did you implement the new Virtual DOM patch algorithm yet?",
  ],
  lobby: [
    "General lobby initialization stream activated.",
    "Hello world! Welcome to the nested component hub.",
  ],
};

// --- 2. REST API ROUTING LAYER ---
// Endpoint matching our chat component request signature: Cmd.fetch('http://localhost:8080/api/history/...')
app.get("/api/history/:roomName", (req, res) => {
  const roomName = req.params.roomName;
  console.log(
    `📂 REST API: Retrieving message history archive log for room: #${roomName}`,
  );

  // Extract historical messages, or return an empty setup seed if the room is brand new
  const pastMessages = chatHistoryDatabase[roomName] || [
    `Joined a fresh channel room: #${roomName}`,
  ];

  // Respond down the REST wire with a type-safe matching payload structure
  res.json({
    roomName: roomName,
    pastMessages: pastMessages,
  });
});

// --- 3. UNIFIED HTTP & WEBSOCKET ENGINE ---
// Bind the Express router onto a standard node HTTP infrastructure wrapper
const server = createServer(app);

// Supported file types map
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/*
const server = createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : req.url || "/index.html";
    const filePath = join(process.cwd(), urlPath);

    if (existsSync(filePath)) {
        // 1. Determine the file extension (e.g., ".js")
        const ext = extname(filePath).toLowerCase();

        // 2. Look up the proper browser content-type header string
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        // 3. Read and pipe the content down to the client with valid headers
        const content = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType }); // ◄ Crucial Fix
        res.end(content);
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File Not Found");
    }
});
*/
// 2. Initialize the WebSocket Server on top of the HTTP infrastructure
const wss = new WebSocketServer({ server });

// Map tracking active topic subscriptions: TopicName -> Set of connected WebSocket Clients
const subscriptions = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected to communication bus.");

  // Handle incoming payloads arriving from the client engine
  ws.on("message", (rawData: string) => {
    try {
      const data = JSON.parse(rawData);

      // Route based on infrastructure actions or message streams
      if (data.action === "subscribe" && typeof data.topic === "string") {
        if (!subscriptions.has(data.topic)) {
          subscriptions.set(data.topic, new Set());
        }
        subscriptions.get(data.topic)!.add(ws);
        console.log(`Client subscribed to topic: ${data.topic}`);
      } else if (
        data.action === "unsubscribe" &&
        typeof data.topic === "string"
      ) {
        subscriptions.get(data.topic)?.delete(ws);
        console.log(`Client unsubscribed from topic: ${data.topic}`);
      } else if (data.topic && data.payload) {
        // Record History 1. Strip the "rooms." prefix to get the pure room name (e.g., "lobby")
        const roomKey = data.topic.replace("rooms.", "");

        if (!chatHistoryDatabase[roomKey]) {
          chatHistoryDatabase[roomKey] = [];
        }

        // Record History 2. CRUCIAL: Append the text to our database so future REST calls pick it up!
        chatHistoryDatabase[roomKey].push(data.payload.msgText);
        console.log(data.payload.msgText);

        // Broadcast incoming chat/data streams to everyone subscribed to this topic
        const clientsListening = subscriptions.get(data.topic);
        if (clientsListening) {
          const outgoingBroadcast = JSON.stringify({
            topic: data.topic,
            payload: data.payload,
          });

          clientsListening.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(outgoingBroadcast);
              console.log(`Sent '${data.payload.msgText}' to client`);
            }
          });
        } else {
          console.log(`No clients listening on topic '${data.topic}'`);
        }
      }
    } catch (err) {
      console.error("Failed to parse incoming payload:", err);
    }
  });

  // Handle clean-up when a user closes or refreshes the page
  ws.on("close", () => {
    console.log("Client disconnected. Cleaning up subscriptions...");
    for (const [topic, clientSet] of subscriptions.entries()) {
      clientSet.delete(ws);
      if (clientSet.size === 0) {
        subscriptions.delete(topic); // Clear dead topics from memory
      }
    }
  });
});

// 3. Fire up the unified server instance
const PORT = 8080;
server.listen(PORT, () => {
  console.log(
    `MVU Web Application running smoothly at http://localhost:${PORT}`,
  );
  console.log(
    `WebSocket communication server listening on ws://localhost:${PORT}`,
  );
});
