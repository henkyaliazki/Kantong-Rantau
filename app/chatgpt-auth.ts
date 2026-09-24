// Compatibility exports for existing callers. Identity now comes only from a database session.
export {getUser as getChatGPTUser} from '@/lib/auth';
