import dotenv from 'dotenv';

// Loaded before anything else is imported, so modules that read settings as they load (the logger)
// see the values from .env
dotenv.config({ quiet: true });
