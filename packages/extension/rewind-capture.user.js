// ==UserScript==
// @name         Rewind Live Capture (ChatGPT & Gemini)
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  A companion script for rewind-for-ai-chats to automatically extract conversation DOMs and sync to your local Rewind archive.
// @author       elvis
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // Settings
    const LOCAL_API_URL = 'http://localhost:8765/import';
    const AUTO_SYNC_ENABLED = false;

    // UI Injection
    function createButton() {
        const btn = document.createElement('button');
        btn.id = 'rewind-capture-btn';
        btn.innerText = '⚡ Save to Rewind';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = '999999';
        btn.style.padding = '12px 20px';
        btn.style.backgroundColor = '#10a37f'; // ChatGPT green-ish
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        btn.style.transition = 'all 0.2s ease';

        btn.onmouseover = () => btn.style.transform = 'translateY(-2px)';
        btn.onmouseout = () => btn.style.transform = 'translateY(0)';
        
        btn.onclick = async () => {
            btn.innerText = '⏳ Saving...';
            btn.style.backgroundColor = '#f59e0b';
            try {
                await extractAndSend();
                btn.innerText = '✅ Saved';
                btn.style.backgroundColor = '#3b82f6';
                setTimeout(() => {
                    btn.innerText = '⚡ Save to Rewind';
                    btn.style.backgroundColor = '#10a37f';
                }, 2000);
            } catch (err) {
                console.error('[Rewind]', err);
                btn.innerText = '❌ Failed';
                btn.style.backgroundColor = '#ef4444';
                setTimeout(() => {
                    btn.innerText = '⚡ Save to Rewind';
                    btn.style.backgroundColor = '#10a37f';
                }, 3000);
            }
        };

        document.body.appendChild(btn);
    }

    async function extractAndSend() {
        // Clone the document to remove injected elements (like our button) before sending
        const docClone = document.documentElement.cloneNode(true);
        const btnInClone = docClone.querySelector('#rewind-capture-btn');
        if (btnInClone) btnInClone.remove();

        // Standardize meta tags so the CLI parser knows metadata
        // For ChatGPT the URL usually has the convo ID: chatgpt.com/c/{id}
        // For Gemini: gemini.google.com/app/{id}
        const urlMatch = window.location.pathname.match(/\/(c|app)\/([a-zA-Z0-9-]+)/);
        const conversationId = urlMatch ? urlMatch[2] : `snapshot-${Date.now()}`;

        const payload = {
            url: window.location.href,
            html: docClone.outerHTML,
            conversationId: conversationId,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: LOCAL_API_URL,
                headers: {
                    "Content-Type": "application/json"
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`Server returned status: ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    // Initialize
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createButton();
    } else {
        window.addEventListener('DOMContentLoaded', createButton);
    }

})();
