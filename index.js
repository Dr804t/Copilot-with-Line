const line = require('@line/bot-sdk');
const express = require('express');
const axios = require('axios').default;
const dotenv = require('dotenv');

dotenv.config();
const app = express();

const lineConfig = {
    channelAccessToken: process.env.ACCESS_TOKEN,
    channelSecret: process.env.SECRET_TOKEN
};

const client = new line.Client(lineConfig);

const DIRECTLINE_TOKEN_URL = process.env.DIRECTLINE_TOKEN_URL;
const DIRECTLINE_CONVERSATION_URL = 'https://directline.botframework.com/v3/directline/conversations';

// Store conversation IDs per user
const userConversations = {};

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
    try {
        const events = req.body.events;
        console.log("Received events:", events);
        
        for (const event of events) {
            await handleEvent(event);
        }
        
        res.sendStatus(200);
    } catch (err) {
        console.error("Error handling webhook:", err);
        res.status(500).send("Internal Server Error");
    }
});

const handleEvent = async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }
    
    try {
        const userId = event.source.userId;
        let token, conversationId;

        // Check if user has an existing conversation
        if (userConversations[userId]) {
            ({ token, conversationId } = userConversations[userId]);
        } else {
            // Get new token and start a new conversation
            token = await getToken();
            conversationId = await startConversation(token);
            userConversations[userId] = { token, conversationId };
        }

        console.log(`User: ${userId}, Conversation ID: ${conversationId}`);
        const botResponse = await sendMessageToCopilot(token, conversationId, event.message.text);

        await client.replyMessage(event.replyToken, { type: 'text', text: botResponse });
    } catch (err) {
        console.error("Error processing message:", err);
        await client.replyMessage(event.replyToken, { type: 'text', text: "Sorry, something went wrong." });
    }
};

const getToken = async () => {
    try {
        const response = await axios.get(DIRECTLINE_TOKEN_URL);
        // {
        //     token:;
        //     expire:;
        //     conversationId:;
        // }
        return response.data.token;
    } catch (err) {
        console.error('Error fetching Direct Line token:', err);
        throw err;
    }
};

const startConversation = async (token) => {
    try {
        const response = await axios.post(DIRECTLINE_CONVERSATION_URL, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data.conversationId;
    } catch (err) {
        console.error('Error starting conversation:', err);
        throw err;
    }
};

const sendMessageToCopilot = async (token, conversationId, userMessage) => {
    try {
        const url = `${DIRECTLINE_CONVERSATION_URL}/${conversationId}/activities`;
        await axios.post(url, {
            type: "message",
            from: { id: "user" },
            text: userMessage
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for response
        
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Received messages from Copilot:", response.data);
        const messages = response.data.activities;
        //const botReply = messages.find(msg => msg.from.id === 'bot');
        console.log("Watermark : ", messages[response.data.watermark].text);
        const botReply = messages[response.data.watermark];
        
        return botReply ? botReply.text : "No response from bot.";
    } catch (err) {
        console.error('Error sending message to Copilot:', err);
        throw err;
    }
};

app.listen(4000, () => {
    console.log('Server is running on port 4000');
});
