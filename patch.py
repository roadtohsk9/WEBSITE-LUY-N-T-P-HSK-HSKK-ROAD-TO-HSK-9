import os,subprocess,json,re,glob,shutil
root='/tmp/hskwork'
# Align both edges for reading passages in HSK6 and related reading module styles
css=os.path.join(root,'css/modules.css')
s=open(css,encoding='utf-8').read()
patch='''\n/* HSK6 reading typography: align both edges for an even paragraph edge. */\n.passage-text, .passage-text p, .passage, .passage p, .reading-passage, .reading-passage p, .reading-content, .reading-content p { text-align: justify; text-justify: inter-word; }\n.passage-text p, .passage p, .reading-passage p, .reading-content p { text-align-last: left; }\n'''
if 'HSK6 reading typography: align both edges' not in s: open(css,'w',encoding='utf-8').write(s+patch)
# preserve source texts in a structured import bundle, separated by skill and original test code
files=['H51001.pdf','H51002.pdf','H51003.pdf','H51004.pdf','H51005.pdf','H51006(1).pdf','H51008(1).pdf','H51328(1).pdf','H51332(1).pdf','H51333.pdf']
# 10 PDFs were provided, retain all as source; tests are marked pending structured import where exact extraction needs visual QA.
items=[]
for fn in files:
    path='/mnt/data/'+fn
    if not os.path.exists(path): continue
    txtpath=os.path.join(root,fn+'.txt')
    subprocess.run(['pdftotext','-layout',path,txtpath],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    txt=open(txtpath,encoding='utf-8',errors='replace').read()
    code=re.search(r'H51\d{3}',txt)
    code=code.group(0) if code else fn.replace('.pdf','')
    # split at original section headings; retain exact source text without fabricating questions/answers
    m1=re.search(r'一、\s*听\s*力',txt)
    m2=re.search(r'二、\s*阅\s*读',txt)
    m3=re.search(r'三、\s*书\s*写',txt)
    listen=txt[m1.start():m2.start()] if m1 and m2 and m1.start()<m2.start() else ''
    reading=txt[m2.start():m3.start()] if m2 and m3 and m2.start()<m3.start() else (txt[m2.start():] if m2 else '')
    items.append({'code':code,'sourceFile':fn,'listeningText':listen.strip(),'readingText':reading.strip(),'audioUrl':'','status':'source-extracted-awaiting-structured-question-import','note':'Audio intentionally left blank for Admin to upload later. Source text retained verbatim; no answers or question structures fabricated.'})
pack={'version':1,'description':'HSK5 source extraction package from user-provided PDFs. Listening and Reading text are split by original headings; audio URLs intentionally blank. These source texts require structured question conversion/QA before publishing as interactive tests.','tests':items}
open(os.path.join(root,'data/hsk5_source_extract.json'),'w',encoding='utf-8').write(json.dumps(pack,ensure_ascii=False,indent=2))
readme='''HSK5 - TÀI LIỆU NGUỒN ĐÃ TRÍCH XUẤT\n\n- Bao gồm 10 mã PDF HSK5 do người dùng tải lên: H51001, H51002, H51003, H51004, H51005, H51006, H51008, H51328, H51332, H51333.\n- Phần Listening và Reading được tách riêng từ văn bản PDF để hỗ trợ nhập liệu tiếp.\n- Audio URL để trống theo yêu cầu; Admin có thể bổ sung audio sau.\n- Lưu ý: đây là gói trích xuất nguồn, chưa phải bộ câu hỏi tương tác đã được kiểm tra đầy đủ. Không tự sinh đáp án hoặc biến nội dung chưa xác minh thành đề chấm điểm.\n- CSS modules.css đã bổ sung căn đều hai bên cho đoạn văn Reading HSK6.\n'''
open(os.path.join(root,'docs/README_HSK5_SOURCE_IMPORT_VI.txt'),'w',encoding='utf-8').write(readme)
# add changelog
open(os.path.join(root,'CHANGELOG_HSK6_FORMAT_HSK5_SOURCE.md'),'w',encoding='utf-8').write('''# HSK6 format and HSK5 source extraction\n\n- Added justified alignment for HSK6 reading paragraphs.\n- Extracted Listening and Reading source text from the 10 uploaded HSK5 PDFs into `data/hsk5_source_extract.json`.\n- Audio URLs remain empty for later Admin upload.\n- Structured interactive question import is not marked complete; the extracted source bundle is retained for accurate conversion and validation.\n''')
