"use client";

import { useEffect, useState } from "react";
import { useAuth, useCollection, useDoc } from "../hooks/useFirebase";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";

export default function Chat() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("en");
  const searchParams = useSearchParams();
  const session = searchParams.get("session");
  const suid = searchParams.get("user");
  const [anonUser, setAnonUser] = useState("");
  const [registered, setRegistered] = useState(false);
  const allLanguages = ["en", "es", "fr", "zh-ch"];

  //console.log("user id " + suid + "session id" + session);
  const { data, add, remove } = useCollection(
    session && suid ? `/users/${suid}/sessions/${session}/messages/` : null,
    { orderBy: "createdAt", dsc: true }
  );

  const { data: sessionData, update: updateSession } = useDoc(
    session && suid ? `/users/${suid}/sessions/${session}/` : null
  );

  console.log(sessionData);
  function sendMessage() {
    add({
      sender: user ? user.displayName : anonUser,
      type: "user",
      text: message,
      language,
    });
    setMessage("");
  }

  function adminMessage(type, name) {
    add({
      type: "admin",
      text: `${user ? user.displayName : anonUser} ${
        type == "signIn" ? `joined the chat` : "left the chat"
      }`,
      language: "en",
    });
  }

  function clearChat() {
    data.forEach((message) => {
      remove(message);
    });
  }

  function registerAnonUser() {
    if (!anonUser) {
      return;
    }

    updateSession({
      sessionLanguages: [...sessionData.sessionLanguages, language],
    });
    adminMessage("signIn");
    setRegistered(true);
  }

  function signOutUser() {
    adminMessage("signOut");
  }

  useEffect(() => {
    window.addEventListener("beforeunload", signOutUser);

    return () => {
      window.removeEventListener("beforeunload", signOutUser);
    };
  }, [user, anonUser]);
  return (
    <>
      <div className="flex justify-center h-screen">
        {!user && !registered && (
          <div className="fixed bg-slate-100 shadow-md p-5 rounded-lg mt-40 flex flex-col items-center">
            <h3 className="font-semibold text-xl p-2">Join Chat</h3>
            <form>
              <input
                className="m-2 p-1 rounded-md"
                placeholder="Name"
                type="text"
                value={anonUser}
                onChange={(e) => setAnonUser(e.target.value)}
              />
              <select
                className="px-3 scale-110 shadow-md"
                onChange={(e) => setLanguage(e.target.value)}
                defaultValue={language}
              >
                {allLanguages.map((lang) => {
                  return <option value={lang}>{lang}</option>;
                })}
              </select>
            </form>
            <button
              onClick={registerAnonUser}
              className={
                (anonUser
                  ? `bg-green-400 hover:bg-green-500 duration-200 `
                  : `bg-gray-300 hover:bg-gray-400 duration-200 `) +
                `rounded-md shadow-sm font-semibold text-white mt-2 p-2 w-full`
              }
            >
              Go
            </button>
          </div>
        )}
        {(user || registered) && (
          <div className="flex flex-col justify-between h-full w-3/4">
            <div className="">
              <div className="my-4">
                <h1 className="font-bold text-4xl text-center">
                  {sessionData?.displayName || sessionData?.email}'s Chat
                </h1>
              </div>
            </div>
            <div className="flex flex-col-reverse overflow-auto h-full">
              {data &&
                data.map((message, i) => {
                  const adminClass =
                    message.type == "admin" ? "bg-yellow-50" : "";
                  const slateClass = !adminClass
                    ? i % 2 == 0
                      ? "bg-slate-100"
                      : "bg-slate-50"
                    : "";
                  if (!message.translated?.[language]) {
                    return;
                  }
                  return (
                    <div
                      className={`flex p-1 ${adminClass || slateClass}`}
                      key={i}
                    >
                      {message.type == "user" && (
                        <p className="font-semibold mr-3">{message.sender}:</p>
                      )}
                      <p
                        className={
                          message.type == "admin" ? `font-bold` : `font-normal`
                        }
                      >
                        {language != message.language
                          ? message?.translated?.[language]
                          : message.text}
                      </p>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center mb-10 ">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className=" border w-3/4 border-black"
              />
              <button
                onClick={sendMessage}
                className="  mx-3 rounded-full px-6  py-2 hover:bg-blue-400 hover:scale-105 text-white bg-blue-300"
              >
                Send
              </button>
              <button
                onClick={clearChat}
                className="mx-3 rounded-full px-6 py-2 hover:bg-red-400 hover:scale-105 text-white bg-red-300"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
