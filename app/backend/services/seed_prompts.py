import sys
import os

# Đảm bảo script có thể import các module từ thư mục backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
from services.prompt_service import PromptService

# Import các prompt đang hardcode để nạp bản v1
from agents.advisor import MATCH_SYSTEM_PROMPT, ADVISOR_CHAT_SYSTEM_PROMPT
from agents.crm import CRM_SYSTEM_PROMPT
from agents.judge import JUDGE_SYSTEM_PROMPT
from agents.judgeGold import GOLDEN_JUDGE_SYSTEM_PROMPT
from orchestrator.router import ROUTER_SYSTEM_PROMPT

# Prompt cho RAG (được trích xuất từ agents/rag.py)
RAG_SYSTEM_PROMPT = (
    "Bạn là trợ lý tuyển sinh của VinUni. Hãy trả lời câu hỏi dựa trên ngữ cảnh được cung cấp bên dưới.\n"
    "QUY TẮC QUAN TRỌNG: Bạn phải luôn cung cấp đường link minh chứng (URL hoặc LIÊN KẾT LIÊN QUAN) từ ngữ cảnh cho mỗi thông tin bạn đưa ra.\n"
    "Nếu ngữ cảnh không chứa thông tin, hãy nói bạn không biết, tuyệt đối không tự bịa thông tin hoặc đường link.\n"
)

def seed_prompts(version: str = "v1"):
    """
    Nạp các prompt khởi tạo vào Database.
    """
    # Khởi tạo kết nối DB
    database.init_database()
    
    service = PromptService()
    
    # Đảm bảo bảng 'prompts' và các schema cần thiết tồn tại trước khi nạp
    service.db.migrate_db()
    
    # Danh sách các prompt cần nạp
    # Key là agent_name được sử dụng trong hàm get_prompt() của các Agent
    prompts_to_seed = {
        "advisor_match": MATCH_SYSTEM_PROMPT,
        "advisor": ADVISOR_CHAT_SYSTEM_PROMPT,
        "crm": CRM_SYSTEM_PROMPT,
        "rag": RAG_SYSTEM_PROMPT,
        "router": ROUTER_SYSTEM_PROMPT,
        "judge_safety": JUDGE_SYSTEM_PROMPT,
        "judge_gold": GOLDEN_JUDGE_SYSTEM_PROMPT
    }
    
    print("\n" + "="*50)
    print(f"🚀 BẮT ĐẦU NẠP PROMPTS VERSION {version}")
    print("="*50)

    # Nếu là v2, nạp từ file local
    if version == "v2":
        prompts_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts")
        mapping = {
            "advisor": "advisor_v2.txt",
            "advisor_match": "advisor_match_v2.txt",
            "rag": "rag_v2.txt",
            "router": "router_v2.txt",
            "judge_safety": "judge_safety_v2.txt",
            "judge_gold": "judge_gold_v2.txt",
            "crm": "crm_v2.txt"
        }
        for name, filename in mapping.items():
            f_path = os.path.join(prompts_path, filename)
            if os.path.exists(f_path):
                with open(f_path, "r", encoding="utf-8") as f:
                    prompts_to_seed[name] = f.read().strip()
            else:
                print(f"⚠️ Cảnh báo: Không tìm thấy file {filename}, sử dụng mặc định.")
    
    success_count = 0
    for name, content in prompts_to_seed.items():
        try:
            print(f"📦 Đang nạp prompt: {name} ({version})...")
            service.save_prompt(name, version, content)
            success_count += 1
        except Exception as e:
            print(f"❌ Lỗi khi nạp {name}: {e}")
            
    print("="*50)
    print(f"✅ HOÀN TẤT: Đã nạp thành công {success_count}/{len(prompts_to_seed)} prompts.")
    print("Giờ đây các Agent sẽ ưu tiên lấy prompt từ Database.")
    print("="*50 + "\n")

if __name__ == "__main__":
    seed_prompts("v2")
