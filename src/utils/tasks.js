// Task bank for the game

export const tasks = [
  // SVG Art tasks
  { id: 'svg_1', category: 'SVG Art', description: 'Generate a SVG of a cat wearing a crown', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  { id: 'svg_2', category: 'SVG Art', description: 'Generate a SVG of a robot having a tea party with animals', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  { id: 'svg_3', category: 'SVG Art', description: 'Generate a SVG of a pizza that is also a planet in space', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  { id: 'svg_4', category: 'SVG Art', description: 'Generate a SVG of a dragon riding a unicycle', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  { id: 'svg_5', category: 'SVG Art', description: 'Generate a SVG of a house made entirely of food', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  { id: 'svg_6', category: 'SVG Art', description: 'Generate a SVG of a wizard fighting a laser pointer', systemPrompt: 'Generate ONLY valid SVG code for an image. No markdown, no explanation, just raw SVG. Make it colorful and detailed. Use viewBox="0 0 400 400".' },
  // Silly Poem tasks
  { id: 'poem_1', category: 'Silly Poem', description: 'Write a haiku about a toaster that thinks it is a philosopher', systemPrompt: 'Write a short, funny poem. Be creative and silly. Keep it under 10 lines.' },
  { id: 'poem_2', category: 'Silly Poem', description: 'Write a limerick about a confused GPS', systemPrompt: 'Write a short, funny poem. Be creative and silly. Keep it under 10 lines.' },
  { id: 'poem_3', category: 'Silly Poem', description: 'Write 4 lines from the perspective of a disappointed alarm clock', systemPrompt: 'Write a short, funny poem. Be creative and silly. Keep it under 10 lines.' },
  { id: 'poem_4', category: 'Silly Poem', description: 'Write a haiku about a cat who discovers the internet', systemPrompt: 'Write a short, funny poem. Be creative and silly. Keep it under 10 lines.' },
  { id: 'poem_5', category: 'Silly Poem', description: 'Write 4 lines from the perspective of a sock that escaped the dryer', systemPrompt: 'Write a short, funny poem. Be creative and silly. Keep it under 10 lines.' },
  // Micro Story tasks
  { id: 'story_1', category: 'Micro Story', description: 'Write a one-paragraph story about a time traveler who only goes back 5 minutes', systemPrompt: 'Write a short, funny story. One paragraph, under 150 words. Have a twist ending.' },
  { id: 'story_2', category: 'Micro Story', description: 'Write a one-paragraph story about a dragon who is afraid of fire', systemPrompt: 'Write a short, funny story. One paragraph, under 150 words. Have a twist ending.' },
  { id: 'story_3', category: 'Micro Story', description: 'Write a one-paragraph story about the last cookie on Earth', systemPrompt: 'Write a short, funny story. One paragraph, under 150 words. Have a twist ending.' },
  { id: 'story_4', category: 'Micro Story', description: 'Write a one-paragraph story about a robot who learns to dream', systemPrompt: 'Write a short, funny story. One paragraph, under 150 words. Have a twist ending.' },
  // Song Lyric tasks
  { id: 'song_1', category: 'Song Lyrics', description: 'Write 4 lines of a breakup song from a smart fridge', systemPrompt: 'Write funny song lyrics. 4-8 lines. Be creative and silly.' },
  { id: 'song_2', category: 'Song Lyrics', description: 'Write 4 lines of a power ballad from a dying lightbulb', systemPrompt: 'Write funny song lyrics. 4-8 lines. Be creative and silly.' },
  { id: 'song_3', category: 'Song Lyrics', description: 'Write 4 lines of a sea shanty from a lost AirPod', systemPrompt: 'Write funny song lyrics. 4-8 lines. Be creative and silly.' },
  { id: 'song_4', category: 'Song Lyrics', description: 'Write 4 lines of a rap battle between coffee and tea', systemPrompt: 'Write funny song lyrics. 4-8 lines. Be creative and silly.' },
  { id: 'song_5', category: 'Song Lyrics', description: 'Write 4 lines of a lullaby from a monster under the bed', systemPrompt: 'Write funny song lyrics. 4-8 lines. Be creative and silly.' },
];

export function getRandomTask() {
  return tasks[Math.floor(Math.random() * tasks.length)];
}

export function getRandomTasks(count) {
  const shuffled = [...tasks].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
