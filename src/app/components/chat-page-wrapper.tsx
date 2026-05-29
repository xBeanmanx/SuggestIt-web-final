import { useAppState } from "../../context/AppStateContext";
import { ChatComponent } from "./chat-page";
import type { User } from "../../types";

export function ChatPageWrapper() {
  const { state } = useAppState();

  if (!state?.currentUser) {
    return <div className="p-6 text-center">Please log in to access chat.</div>;
  }

  // For now, use the first group or show a message to select one
  const selectedGroup = state.groups[0];
  if (!selectedGroup) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please create or join a group to start chatting.</p>
      </div>
    );
  }

  const groupMembers: User[] = [state.currentUser, ...state.users.filter(u => 
    selectedGroup.members?.some(m => m.userId === u.id)
  )];

  return (
    <ChatComponent
      currentUser={state.currentUser}
      groupId={selectedGroup.id}
      groupMembers={groupMembers}
    />
  );
}
