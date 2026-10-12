(function(){
"use strict";

const input=document.getElementById("pdfInput");
const chooseBtn=document.getElementById("chooseBtn");
const drop=document.getElementById("dropZone");
const processBtn=document.getElementById("processBtn");
const status=document.getElementById("status");
const fileName=document.getElementById("fileName");
const resultCard=document.getElementById("resultCard");
const results=document.getElementById("results");
const downloadBtn=document.getElementById("downloadBtn");
const previewBtn=document.getElementById("previewBtn");
const printBtn=document.getElementById("printBtn");
const pdfPreview=document.getElementById("pdfPreview");
let outputUrl=null;

let selectedFile=null, outputBytes=null;

function setStatus(msg){ status.textContent=msg; }

chooseBtn.addEventListener("click", function(e){
  e.preventDefault(); e.stopPropagation(); input.click();
});

drop.addEventListener("click", function(e){
  if(e.target!==chooseBtn) input.click();
});

input.addEventListener("change", function(){
  if(this.files && this.files.length) selectFile(this.files[0]);
});

["dragenter","dragover"].forEach(function(ev){
  drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.add("drag");});
});
["dragleave","drop"].forEach(function(ev){
  drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.remove("drag");});
});
drop.addEventListener("drop",function(e){
  const f=e.dataTransfer.files && e.dataTransfer.files[0];
  if(f && (f.type==="application/pdf" || /\.pdf$/i.test(f.name))) selectFile(f);
  else setStatus("Please select a PDF file.");
});

function selectFile(f){
  if(!f || (!/\.pdf$/i.test(f.name) && f.type!=="application/pdf")){
    setStatus("Please select a PDF file.");
    return;
  }
  selectedFile=f;
  fileName.textContent=f.name+" ("+(f.size/1024/1024).toFixed(2)+" MB)";
  processBtn.disabled=false;
  setStatus("PDF selected successfully. Click Process PDF.");
}

function mm(v){return v*72/25.4;}

function detectTracking(text){
  const candidates=(text.toUpperCase().match(/[A-Z0-9]{12,24}/g)||[]);
  for(const c of candidates){
    if(/^VL\d{13}$/.test(c)) return c;
    if(/^SF[A-Z0-9]{8,}$/.test(c)) return c;
    if(/^\d{12,20}$/.test(c)) return c;
  }
  return null;
}

async function getPageText(page){
  const content=await page.getTextContent();
  return content.items.map(function(i){return i.str||"";}).join(" ");
}

async function getPageDetails(page){
  const content=await page.getTextContent();
  const items=content.items
    .map(function(i){
      return {
        text:(i.str||"").trim(),
        x:(i.transform && i.transform[4]) || 0,
        y:(i.transform && i.transform[5]) || 0
      };
    })
    .filter(function(i){return i.text;});
  const text=items.map(function(i){return i.text;}).join(" ");
  const tracking=detectTracking(text);
  // PDF.js text coordinates use the PDF page's bottom-left origin. Keep the
  // baseline of the invoice disclaimer so SKU/courier can be printed beneath it.
  const disclaimerItem=items.find(function(i){
    return /Tax is not payable on reverse charge basis/i.test(i.text);
  });
  const disclaimerY=disclaimerItem ? disclaimerItem.y : mm(60);

  // Read the SKU value positioned directly below the "SKU" column heading.
  let sku=null;
  const skuHeader=items.find(function(i){return /^SKU$/i.test(i.text);});
  if(skuHeader){
    const candidates=items.filter(function(i){
      return i.y < skuHeader.y - 1 &&
             Math.abs(i.x-skuHeader.x) < 35 &&
             !/^(SKU|Size|Qty|Color|Order No\.?|Product Details)$/i.test(i.text);
    }).sort(function(a,b){
      const dyA=skuHeader.y-a.y, dyB=skuHeader.y-b.y;
      return dyA-dyB;
    });
    if(candidates.length) sku=candidates[0].text;
  }

  // Fallback for PDFs whose text order is extracted differently.
  if(!sku){
    const normalized=text.replace(/\s+/g," ").trim();
    const m=normalized.match(/SKU\s+Size\s+Qty\s+Color\s+Order\s+No\.?\s+(.+?)\s+(?:Free Size|FreeSize|One Size|1 Size)\b/i);
    if(m) sku=m[1].trim();
  }

  let courier="Other / Unknown";
  // Detect the carrier name printed in the shipping-label header.
  // Keep ValmoPlus and Valmo Pickup under the common "Valmo" group.
  if(/\bValmo(?:Plus)?\b/i.test(text)) courier="Valmo";
  else if(/\bShadowfax\b/i.test(text) || /\bSF[A-Z0-9]{8,}FPL\b/i.test(text)) courier="Shadowfax";
  else if(/\bXpress\s*Bees\b/i.test(text) || /\bXpressbees\b/i.test(text)) courier="XpressBees";
  else if(/\bDelhivery\b/i.test(text)) courier="Delhivery";
  else if(/\bEcom\s*Express\b/i.test(text)) courier="Ecom Express";
  else if(/\bDTDC\b/i.test(text)) courier="DTDC";

  return {tracking:tracking, sku:sku || "SKU not detected", courier:courier, disclaimerY:disclaimerY};
}

function renderSummary(details){
  const skuCounts=new Map(), courierCounts=new Map();
  details.forEach(function(d){
    const sku=d.sku || "SKU not detected";
    const courier=d.courier || "Other / Unknown";
    skuCounts.set(sku,(skuCounts.get(sku)||0)+1);
    courierCounts.set(courier,(courierCounts.get(courier)||0)+1);
  });

  function tableRows(map){
    return Array.from(map.entries()).sort(function(a,b){return b[1]-a[1];})
      .map(function(entry){
        return '<tr><td>'+escapeHtml(entry[0])+'</td><td class="qty">'+entry[1]+'</td></tr>';
      }).join("");
  }
  const totalOrders=details.length;
  const trackedOrders=details.filter(function(d){return Boolean(d.tracking);}).length;
  results.innerHTML =
    '<div class="totals-grid">'+
      '<div class="total-card"><span>Total Orders</span><strong>'+totalOrders+'</strong></div>'+
      '<div class="total-card"><span>Tracking Numbers Found</span><strong>'+trackedOrders+'</strong></div>'+
    '</div>'+
    '<div class="summary-grid">'+
      '<section class="summary-panel"><h3>SKU Wise</h3><table><thead><tr><th>SKU</th><th>Orders</th></tr></thead><tbody>'+
        tableRows(skuCounts)+'</tbody></table></section>'+
      '<section class="summary-panel"><h3>Courier Partner Wise</h3><table><thead><tr><th>Courier Partner</th><th>Orders</th></tr></thead><tbody>'+
        tableRows(courierCounts)+'</tbody></table></section>'+
    '</div>'+
    '<p class="summary-note">Each PDF page is counted as one order. Courier partner is detected from the carrier name printed on the shipping label.</p>';
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
  });
}

function barcodeDataUrl(code){
  const canvas=document.createElement("canvas");
  bwipjs.toCanvas(canvas,{
    bcid:"code128", text:code, scale:3, height:12,
    includetext:false, padding:0, backgroundcolor:"FFFFFF"
  });
  return canvas.toDataURL("image/png");
}

function qrPngDataUrl(){
  const qr=qrcode(0,"M");
  qr.addData("https://www.meesho.com/RAMAGLOBALVENTURES");
  qr.make();

  // qrcode-generator returns a GIF data URL. Convert that GIF to a real PNG
  // before passing it to PDF-Lib's embedPng().
  const gifUrl=qr.createDataURL(8,0);
  return new Promise(function(resolve,reject){
    const img=new Image();
    img.onload=function(){
      const canvas=document.createElement("canvas");
      canvas.width=img.naturalWidth || img.width;
      canvas.height=img.naturalHeight || img.height;
      const ctx=canvas.getContext("2d");
      ctx.fillStyle="#FFFFFF";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror=function(){reject(new Error("Could not convert QR code to PNG."));};
    img.src=gifUrl;
  });
}

async function processPdf(){
  if(!selectedFile) return;
  processBtn.disabled=true;
  resultCard.hidden=true;
  results.innerHTML="";
  try{
    if(!window.pdfjsLib) throw new Error("PDF library did not load. Check your internet connection and refresh.");
    if(!window.PDFLib) throw new Error("PDF editor library did not load. Check your internet connection and refresh.");
    if(!window.bwipjs) throw new Error("Barcode library did not load. Check your internet connection and refresh.");

    setStatus("Reading PDF...");
    // Keep separate copies: PDF.js may transfer/detach the ArrayBuffer it receives.
    // Reusing that same buffer in pdf-lib can cause "No PDF header found".
    const fileBuffer=await selectedFile.arrayBuffer();
    const pdfJsBytes=new Uint8Array(fileBuffer.slice(0));
    const pdfLibBytes=new Uint8Array(fileBuffer.slice(0));

    const loading=window.pdfjsLib.getDocument({data:pdfJsBytes});
    const pdf=await loading.promise;
    const out=await PDFLib.PDFDocument.load(pdfLibBytes);
    const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
    const boldFont=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const details=[];

    for(let i=1;i<=pdf.numPages;i++){
      setStatus("Reading SKU and courier: page "+i+"/"+pdf.numPages);
      const page=await pdf.getPage(i);
      details.push(await getPageDetails(page));
    }

    for(let i=0;i<out.getPageCount();i++){
      const detail=details[i];
      const code=detail.tracking;
      const page=out.getPage(i);
      const pw=page.getWidth(), ph=page.getHeight();
      const left=mm(Math.max(0,Number(document.getElementById("leftMargin").value)||0));
      const right=mm(Math.max(0,Number(document.getElementById("rightMargin").value)||0));
      const bottom=mm(Math.max(0,Number(document.getElementById("bottomMargin").value)||8));
      const bh=mm(Math.max(5,Number(document.getElementById("barcodeHeight").value)||20));
      const textPx=Math.max(7,Number(document.getElementById("textSize").value)||16);
      const show=document.getElementById("showText").value==="yes";
      const qrEnabled=document.getElementById("qrEnabled").value==="yes";

      // Print compact SKU | Courier line on every page, left-aligned and bold by default.
      // UI size is in px; PDF font size uses points (1 px ≈ 0.75 pt).
      const infoTextPx=Math.max(7,Math.min(40,Number(document.getElementById("infoTextSize").value)||16));
      const infoFontSize=infoTextPx*0.75;
      const infoY=Math.max(mm(30),detail.disclaimerY-30);
      const infoLine=(detail.sku || "SKU not detected")+"   |   "+(detail.courier || "Other / Unknown");
      page.drawText(infoLine,{
        x:mm(6), y:infoY, size:infoFontSize, font:boldFont,
        color:PDFLib.rgb(0,0,0), maxWidth:pw-mm(12)
      });

      // If a page has no detected tracking number, still print SKU/courier but
      // do not try to create a barcode for that page.
      if(!code) continue;

      // Reserve 35 mm QR + 5 mm gap on the right. The QR keeps a 5 mm right margin.
      const qrSize=mm(35);
      const qrGap=mm(5);
      const barcodeWidth=Math.max(20,pw-left-right-(qrEnabled ? qrSize+qrGap : 0));

      const png=await out.embedPng(barcodeDataUrl(code));
      page.drawImage(png,{x:left,y:bottom,width:barcodeWidth,height:bh});

      if(show){
        // Requested text size is in CSS-like px; convert to PDF points.
        // 16 px ≈ 12 pt, i.e. about 5 px larger than the old ~11 px visual size.
        const fontSize=Math.max(5,textPx*0.75);
        const tw=font.widthOfTextAtSize(code,fontSize);
        page.drawText(code,{
          x:Math.max(left,(pw-tw)/2),
          y:Math.max(1,bottom-fontSize-3),
          size:fontSize,font:font,color:PDFLib.rgb(0,0,0)
        });
      }

      if(qrEnabled){
        const qrPng=await out.embedPng(await qrPngDataUrl());
        const qrX=pw-right-qrSize;
        page.drawImage(qrPng,{x:qrX,y:bottom,width:qrSize,height:qrSize});

        const qrTextSize=Math.max(7,textPx*0.75);
        const follow="FOLLOW PLEASE";
        const fw=font.widthOfTextAtSize(follow,qrTextSize);
        page.drawText(follow,{
          x:qrX+(qrSize-fw)/2,
          y:Math.max(1,bottom-qrTextSize-3),
          size:qrTextSize,
          font:font,
          color:PDFLib.rgb(0,0,0)
        });
      }
    }

    setStatus("Creating final PDF...");
    outputBytes=await out.save();
    resultCard.hidden=false;
    renderSummary(details);
    const count=details.filter(function(d){return Boolean(d.tracking);}).length;
    setStatus("Done — "+count+" of "+details.length+" pages received a barcode. Summary grouped by SKU and courier partner.");
  }catch(err){
    console.error(err);
    setStatus("Error: "+(err && err.message ? err.message : String(err)));
  }finally{
    processBtn.disabled=!selectedFile;
  }
}

processBtn.addEventListener("click",processPdf);

function getOutputUrl(){
  if(!outputBytes) return null;
  if(outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl=URL.createObjectURL(new Blob([outputBytes],{type:"application/pdf"}));
  return outputUrl;
}

previewBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  // Show the generated PDF directly inside the page.
  pdfPreview.src=url;
  pdfPreview.style.display="block";
  pdfPreview.scrollIntoView({behavior:"smooth",block:"start"});
});

printBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  // Open the generated PDF in a browser tab; from there Ctrl+P / Print works
  // without first downloading the PDF file.
  const tab=window.open(url,"_blank");
  if(!tab){
    // Popup blocked: show the embedded preview instead.
    pdfPreview.src=url;
    pdfPreview.style.display="block";
    pdfPreview.scrollIntoView({behavior:"smooth",block:"start"});
    setStatus("Popup was blocked. Use the PDF preview and press Ctrl+P to print.");
    return;
  }
  setTimeout(function(){
    try{tab.focus();}catch(e){}
  },300);
});

downloadBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  const a=document.createElement("a");
  a.href=url;
  a.download=selectedFile.name.replace(/\.pdf$/i,"")+"_barcoded.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
});
})();
