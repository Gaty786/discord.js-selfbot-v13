const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

// Initialize Express app
const app = express();
const client = new Client({ checkUpdate: false });

// Configuration
const TARGET_SERVER = process.env.TARGET_SERVER;
const TARGET_CATEGORY = process.env.TARGET_CATEGORY;
const SPECIAL_ROLE = process.env.SPECIAL_ROLE;
const LOG_FILE = process.env.LOG_FILE || 'server_log.txt';
const WEB_PORT = process.env.WEB_PORT || 3000;

// Bot status data
let botStatus = {
    loggedIn: false,
    username: null,
    avatar: null,
    guilds: [],
    messages: [],
    voiceActivities: [],
    lastActivity: null
};

// Setup Express server
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Create HTTP server
const server = app.listen(WEB_PORT, () => {
    console.log(`Web dashboard available at http://localhost:${WEB_PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    // Send initial status
    ws.send(JSON.stringify({
        type: 'status',
        data: {
            loggedIn: botStatus.loggedIn,
            username: botStatus.username,
            avatar: botStatus.avatar,
            uptime: process.uptime(),
            lastActivity: botStatus.lastActivity
        }
    }));

    // Send server list
    ws.send(JSON.stringify({
        type: 'servers',
        data: botStatus.guilds
    }));

    // Send recent messages
    botStatus.messages.slice(-10).reverse().forEach(msg => {
        ws.send(JSON.stringify({
            type: 'message',
            timestamp: msg.timestamp,
            message: msg.content
        }));
    });

    // Send recent voice activities
    botStatus.voiceActivities.slice(-10).reverse().forEach(activity => {
        ws.send(JSON.stringify({
            type: 'voice',
            timestamp: activity.timestamp,
            message: activity.content
        }));
    });
});

// Enhanced logging function
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    fs.appendFileSync(LOG_FILE, logEntry + '\n');
    
    // Store for web interface
    const entry = { timestamp, content: message };
    botStatus.messages.push(entry);
    botStatus.lastActivity = timestamp;
    
    // Keep only the last 100 messages
    if (botStatus.messages.length > 100) {
        botStatus.messages.shift();
    }
    
    // Broadcast to all connected clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'message',
                timestamp,
                message
            }));
        }
    });
}

// Discord Client Events
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    botStatus = {
        ...botStatus,
        loggedIn: true,
        username: client.user.tag,
        avatar: client.user.displayAvatarURL({ size: 256 }),
        guilds: client.guilds.cache.map(g => g.name)
    };
    logToFile(`Bot started as ${client.user.tag}`);
    
    // Broadcast status update
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'status',
                data: {
                    loggedIn: true,
                    username: botStatus.username,
                    avatar: botStatus.avatar,
                    uptime: process.uptime(),
                    lastActivity: botStatus.lastActivity
                }
            }));
            client.send(JSON.stringify({
                type: 'servers',
                data: botStatus.guilds
            }));
        }
    });
});

client.on('messageCreate', (message) => {
    if (message.guild?.id === TARGET_SERVER) {
        const shortContent = `${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`;
        logToFile(`Message in #${message.channel.name} from ${message.author.tag}: ${shortContent}`);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.guild.id !== TARGET_SERVER) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    let activity;
    if (!oldState.channelId && newState.channelId) {
        activity = `${member.user.tag} joined voice channel ${newState.channel.name}`;
    } else if (oldState.channelId && !newState.channelId) {
        activity = `${member.user.tag} left voice channel ${oldState.channel.name}`;
    } else if (oldState.channelId !== newState.channelId) {
        activity = `${member.user.tag} switched from ${oldState.channel.name} to ${newState.channel.name}`;
    }

    if (activity) {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, content: activity };
        botStatus.voiceActivities.push(entry);
        botStatus.lastActivity = timestamp;
        
        if (botStatus.voiceActivities.length > 50) {
            botStatus.voiceActivities.shift();
        }
        
        logToFile(activity);
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'voice',
                    timestamp,
                    message: activity
                }));
            }
        });
    }
});

client.on('channelCreate', async (channel) => {
    try {
        if (channel.guild.id === TARGET_SERVER && channel.parentId === TARGET_CATEGORY) {
            logToFile(`New channel created: #${channel.name}`);

            const guild = channel.guild;
            await guild.members.fetch();

            const targetMembers = guild.members.cache.filter(member => 
                member.roles.cache.size === 1 && 
                member.roles.cache.has(SPECIAL_ROLE)
            );

            const mention = targetMembers.size > 0 ? targetMembers.first().toString() : '';
            const message = `Hello there, please follow the template${mention ? ` (${mention})` : ''}.
<@&1312606279998640241>
**TEMPLATE:**
Your In-Game Name:
Your Steam ID:
Robber In-Game Name:
Robber Steam64ID:
Items Robbed:
Evidence:`;

            await channel.send(message);
        }
    } catch (error) {
        console.error('Error:', error);
        logToFile(`Error: ${error.message}`);
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
    logToFile(`Unhandled rejection: ${error.message}`);
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);

// Uptime broadcast
setInterval(() => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'status',
                data: {
                    uptime: process.uptime()
                }
            }));
        }
    });
}, 10000);
