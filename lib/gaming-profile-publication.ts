export type GamingProfilePublication = {
  mode: "legacy" | "new";
  public: boolean;
  revision: number;
  objectionOpen: boolean;
};

export type GamingProfilePublicationActionState = {
  status: "idle" | "saved" | "conflict" | "unavailable";
  publication?: GamingProfilePublication;
};
