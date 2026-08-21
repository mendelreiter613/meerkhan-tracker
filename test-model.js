const { generateText } = require('ai');
const { google } = require('@ai-sdk/google');

async function test() {
  try {
    const { text } = await generateText({
      model: google('gemini-1.5-pro'),
      prompt: 'Write a short story about a magic backpack.',
    });
    console.log(text);
  } catch (error) {
    console.error(error);
  }
}
test();