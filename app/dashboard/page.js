"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useCollection } from "../hooks/useFirebase";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const router = useRouter();
  const { data, add } = useCollection(user ? `/users/${uid}/sessions/` : null);

  function createNewSession() {
    //TODO language setting on signup
    const sessionData = {
      sessionLanguages: ["en"],
      displayName: user.displayName,
      email: user.email,
    };

    add(sessionData).then((session) => {
      router.push(`/chat/?user=${user.uid}&session=${session.id}`);
    });
  }

  return (
    <>
      <div className="h-screen">
        <div className="flex bg-gray-200 p-3 justify-end fixed w-full ">
          <button
            className="font-semibold pr-5"
            onClick={async () => {
              await signOut().then(() => router.push("/"));
            }}
          >
            Sign Out
          </button>
        </div>
        <div className="flex justify-center h-full items-center">
          <button
            onClick={createNewSession}
            className="bg-blue-400 hover:bg-blue-500 hover:cursor-pointer hover:scale-105 duration-200 px-4 py-2 font-semibold text-white rounded-full"
          >
            Create Chat
          </button>
        </div>
      </div>
    </>
  );
}
