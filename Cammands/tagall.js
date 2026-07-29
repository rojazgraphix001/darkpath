const isOwner = require('../lib/isOwner');

async function tagAllCommand(sock, chatId, senderId, message) {

    try {

        // Owner check only

        if (!isOwner(senderId)) {

            await sock.sendMessage(

                chatId,

                { text: 'Only the bot owner can use the .tagall command.' },

                { quoted: message }

            );

            return;

        }

        // Get group metadata

        const groupMetadata = await sock.groupMetadata(chatId);

        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {

            await sock.sendMessage(chatId, { text: 'No participants found in the group.' });

            return;

        }

        // Create message with each member on a new line

        let messageText = '📢 *Attention Everyone:*\n\n';

        participants.forEach(participant => {

            messageText += `@${participant.id.split('@')[0]}\n`;

        });

        // Send message with mentions

        await sock.sendMessage(chatId, {

            text: messageText,

            mentions: participants.map(p => p.id)

        });

    } catch (error) {

        console.error('Error in tagall command:', error);

        await sock.sendMessage(chatId, { text: 'Failed to tag all members.' });

    }

}

module.exports = tagAllCommand;