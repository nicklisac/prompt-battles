// Scoring logic

export function tallyVotes(votes, playerIds) {
  const scores = {};
  for (const id of playerIds) scores[id] = 0;
  for (const vote of votes) {
    if (scores[vote.targetPlayerId] !== undefined) scores[vote.targetPlayerId]++;
  }
  return scores;
}

export function findTie(scores) {
  const maxScore = Math.max(...Object.values(scores));
  const leaders = Object.entries(scores)
    .filter(([, score]) => score === maxScore)
    .map(([id]) => id);
  return leaders.length > 1 ? leaders : null;
}

export function generateTiebreakerPrompt(task, tiedSubmissions) {
  return `You are judging a creative prompt battle. The task was: "${task.description}"
  
Here are the submissions from the tied players:

${tiedSubmissions.map((s, i) => `Player ${String.fromCharCode(65 + i)}:
Prompt: "${s.prompt}"
Output: ${s.response}`).join('\n---\n')}

Which player submission is best? Respond with ONLY a single letter (A, B, C, etc.) for the winner.`;
}

export function parseTiebreakerResponse(response, tiedPlayerIds) {
  const match = response.trim().match(/^[A-Z]/i);
  if (match) {
    const index = match[0].toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < tiedPlayerIds.length) return tiedPlayerIds[index];
  }
  return tiedPlayerIds[Math.floor(Math.random() * tiedPlayerIds.length)];
}
