export type Session = { id: string; status: 'active' | 'paused' | 'ended'; remainingSeconds: number; elapsedSeconds: number };
export type Source = { id: string; name: string };
export type Config = { api: string; website: string; platform: string; packaged: boolean; secureStorage: boolean; shortcuts: Record<string, string>; updateEnabled: boolean };
declare global {
  interface Window {
    ctrue?: {
      config(): Promise<Config>; credentials(): Promise<string | null>; refresh(): Promise<string | null>; signout(): Promise<void>;
      currentScreen(): Promise<Source>; selectSource(id: string): Promise<void>; protect(value: boolean): Promise<void>; shortcuts(value: Record<string, string>): Promise<string[]>; recording(on: boolean): Promise<void>;
      popupState(value: { status: string; question: string; answer: string; heard: string; error: string; shots: number }): Promise<void>; popupAsk(text: string): Promise<void>; popupHide(): Promise<void>;
      openaiKey(): Promise<string | null>; setOpenaiKey(value: string | null): Promise<void>;
      permissions(): Promise<{ screen: string; microphone: string }>; requestPermission(kind: 'screen' | 'microphone'): Promise<void>; relaunch(): Promise<void>;
      minimize(): Promise<void>; maximize(): Promise<void>; quit(): Promise<void>; openLogin(): Promise<void>; openAccount(): Promise<void>; installUpdate(): Promise<void>;
      onEvent(callback: (event: { action: string; payload?: unknown }) => void): () => void;
    };
  }
}
