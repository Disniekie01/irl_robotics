from modules.mic import record_audio
from modules.whisper_transcriber import transcribe_audio
from modules.llm import get_llm_response
from modules.tts import speak

def main():
    print("🎙️ Speak to IRL Robotics... (say 'exit' to quit)")

    while True:
        audio_path = record_audio(duration=4)
        text = transcribe_audio(audio_path)

        print(f"\n📝 You said: {text}")

        if "exit" in text.lower():
            print("👋 Exiting.")
            break

        result = get_llm_response(text)

        print(f"\n🤖 Reply: {result['reply']}")
        speak(result["reply"], voice="Daniel")  # 👈 la voix de IRL Robotics

        print(f"📦 Command: {result['command']}\n")


if __name__ == "__main__":
    main()
