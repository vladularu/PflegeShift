import { Share } from "react-native";
export async function shareCalendarPerformanceFile(
  serialized: string,
  file: {
    create: () => void;
    write: (value: string) => void;
    delete: () => void;
    readonly exists: boolean;
    readonly uri: string;
  },
) {
  let created = false;
  try {
    file.create();
    created = true;
    file.write(serialized);
    return await Share.share({ url: file.uri }, { subject: "LUNA Shift Kalenderdiagnose" });
  } finally {
    if (created && file.exists) file.delete();
  }
}
