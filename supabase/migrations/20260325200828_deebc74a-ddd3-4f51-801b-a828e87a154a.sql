DELETE FROM messages WHERE jid LIKE '%@g.us' OR jid = 'status@broadcast';
DELETE FROM conversations WHERE jid LIKE '%@g.us' OR jid = 'status@broadcast';