import { loadConfig } from "./config";

interface ProviderInput {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
  deriveFrom?: string;
}

interface ProviderItem {
  id: string;
  name: string;
  subtitle: string;
  inputs?: ProviderInput[];
}

export function list() {
  const config = loadConfig();

  const items: ProviderItem[] = config.projects.map((project) => {
    const item: ProviderItem = {
      id: project.id,
      name: project.name,
      subtitle: project.path.replace(process.env.HOME || "", "~"),
    };

    if (project.worktree) {
      item.inputs = [
        {
          id: "session",
          label: "Session Name",
          placeholder: "e.g. fix login bug",
          required: true,
        },
        {
          id: "branch",
          label: "Branch Name",
          placeholder: "auto-generated from session name",
          required: false,
          deriveFrom: "session",
        },
      ];
    }

    return item;
  });

  return { items };
}
