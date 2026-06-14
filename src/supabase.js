import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Generate a random 6-character room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a random player ID
export function generatePlayerId() {
  return 'p_' + Math.random().toString(36).substring(2, 10);
}

// Fun random player names
const adjectives = ['Sneaky', 'Brave', 'Cosmic', 'Silly', 'Mighty', 'Wise', 'Wild', 'Golden', 'Shadow', 'Crystal'];
const nouns = ['Panda', 'Falcon', 'Ninja', 'Wizard', 'Dragon', 'Phoenix', 'Wolf', 'Tiger', 'Eagle', 'Shark'];

export function generatePlayerName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
}

// Join a room channel
export function joinRoomChannel(roomCode, onMessage) {
  const channel = supabase.channel(`room:${roomCode}`);

  channel.on('broadcast', { event: '*' }, (payload) => {
    if (onMessage) onMessage(payload.payload.data);
  });

  return {
    subscribe: (player) => {
      return channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track(player);
        }
      });
    },
    broadcast: (message) => {
      channel.send({
        type: 'broadcast',
        event: message.type,
        payload: message,
      });
    },
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
    updatePresence: (player) => {
      channel.track(player);
    }
  };
}
