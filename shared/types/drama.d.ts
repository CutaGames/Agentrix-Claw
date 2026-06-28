export interface DramaChoice {
    id: string;
    label: string;
    next: string;
}
export interface DramaScene {
    id: string;
    episode: number;
    bg?: string;
    speaker?: string;
    text: string;
    choices?: DramaChoice[];
    next?: string;
    ending?: boolean;
}
export interface DramaEpisode {
    episode: number;
    title: string;
    unlockCostAxp: number;
}
export interface DramaStory {
    title: string;
    synopsis?: string;
    startSceneId: string;
    episodes: DramaEpisode[];
    scenes: DramaScene[];
}
export interface DramaState {
    unlockedEpisodes: number[];
}
export interface UnlockEpisodeResponse {
    ok: boolean;
    episode: number;
    unlockedEpisodes: number[];
    chargedAxp: number;
}
