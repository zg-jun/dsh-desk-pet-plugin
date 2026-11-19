// Ambient contract for the float page: the preload bridge, the injected core
// bundle, and the dev-only benchmark counters.
interface Window {
  PetCore: any;
  deskPet?: {
    fitContent?(w: number, h: number): void;
    setInteractive?(on: boolean): void;
    hitRegion?(rect: { x: number; y: number; w: number; h: number }): void;
    quitPet?(): void;
    onHintBeforeHide?(callback: () => void): void;
    onStatus?(callback: (status: any) => void): void;
    menu?(): void;
    settings?(): void;
    hidePet?(): void;
    dragStart?(x: number, y: number): void;
    dragEnd?(): void;
    openSession?(id: string): void;
    focusApp?(): void;
    petAnswer?(sessionId: string, kind: string, answer: unknown): void;
  };
  __petStats: { renders: number; draws: number; frameMs: number[] } | null;
}
