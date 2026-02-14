require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('No API key found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    try {
        // Not all SDK versions expose listModels globally easily, 
        // but let's try to access the underlying API or just guess some
        // Actually, for the JS SDK, we might not have a direct listModels helper 
        // on the main class in older versions, but let's try.
        // If not, we can make a simple fetch request to the endpoint mentioned in the error.
        
        console.log('Checking available models via direct API call...');
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (data.models) {
            console.log('\n✅ Available Models:');
            data.models.forEach(model => {
                if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${model.name} (${model.displayName})`);
                }
            });
        } else {
            console.log('❌ No models found or error:', data);
        }

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();