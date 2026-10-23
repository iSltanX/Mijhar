export function renderReport(all) {
  return `# مؤقت\n\n\`\`\`json\n${JSON.stringify(all, null, 2).slice(0, 2000)}\n\`\`\`\n`;
}
