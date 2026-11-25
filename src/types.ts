export type Rarity = 'blue' | 'purple' | 'pink' | 'red' | 'gold';
export type ItemKind = 'skin' | 'sticker' | 'pin';
export type ContainerKind = 'case' | 'capsule' | 'pin-pack';
export interface Skin { id: string; name: string; weapon: string; rarity: Rarity; price: number; image: string; kind?: ItemKind; wear?: 'FN' | 'FT'; marketHashName?: string }
export interface Case { id: string; name: string; subtitle: string; price: number; color: string; accent: string; tag?: string; category: 'budget' | 'collection' | 'premium'; containerKind?: ContainerKind; weapons?: string[]; goldOnly?: boolean; art: number; image: string; cover?: string; skinNames?: string[]; edition?: string; dropWeights?: Readonly<Record<string, number>> }
export interface Item { uid: string; skinId: string; obtained: number }
export interface HistoryEntry { id: string; title: string; amount: number; time: number }
export interface Drop { uid: string; skinId: string; caseName: string; time: number }
export interface CrashStake { id: string; skinId: string; value: number; payoutMode?: 'skin' }
export interface CrashRound extends CrashStake { startedAt: number; point: number; autoAt: number; cashedAt: number; payout: number; rewardSkinId?: string; balanceRemainder?: number }
export type RouletteColor = 'graphite' | 'red' | 'blue' | 'gold';
export interface RouletteBet { id: string; amount: number; color: RouletteColor; index: number; previousAngle?: number; closesAt: number; settlesAt: number; skinStake?: { skinId: string; prizeSkinId: string; prizeValue: number; remainder: number } }
export interface RouletteResult extends RouletteBet { payout: number }
export interface MineRound { id: string; amount: number; skinId?: string; mines: number[]; revealed: number[] }
export type PlayerEmblem = 'nuke' | 'ancient' | 'dust2';
export interface PlayerIdentity { id: string; nickname: string; emblem: PlayerEmblem }
export interface Player { office20?: 'active' | 'redeemed'; profile: PlayerIdentity; pendingOpening?: { caseId: string; itemIds: string[] }; crashStake?: CrashStake; activeCrash?: CrashRound; lastCrash?: CrashRound; crashRounds?: number[]; rouletteBet?: RouletteBet; rouletteRounds?: RouletteResult[]; mineRound?: MineRound; version: 1; balance: number; inventory: Item[]; drops: Drop[]; history: HistoryEntry[]; favorites: string[]; opened: number; sound: boolean }
export type Route = 'cases' | 'skins' | 'case' | 'upgrade' | 'crash' | 'mines' | 'contracts' | 'wheel' | 'profile';



