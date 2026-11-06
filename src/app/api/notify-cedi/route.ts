import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, employeeName, tierLabel, deadlineTimeStr, shiftId, tier } = body;

    if (!phone || !employeeName) {
      return NextResponse.json({ ok: false, error: 'Missing phone or employeeName' }, { status: 400 });
    }

    // Format Costa Rica phone number (+506) if 8 digits
    const cleanDigits = String(phone).replace(/\D/g, '');
    const formattedPhone = cleanDigits.length === 8 ? `506${cleanDigits}` : cleanDigits;

    const message =
      `🍗 *Pollo Frito Sabor Cervanteño — Control CEDI*\n\n` +
      `Hola *${employeeName}*, tu turno activo en CEDI requiere *Confirmación de Continuidad Laboral* (${tierLabel || `Nivel ${tier}`}) antes de las *${deadlineTimeStr || 'próximos minutos'}* para evitar el cierre automático del sistema por inactividad.\n\n` +
      `📍 *Acción requerida:* Por favor acércate a la pantalla del reloj checador y presiona el botón: "Confirmar Continuidad de Turno (Evitar Cierre)". ✅`;

    // 1. Custom Webhook / UltraMsg / WhatsApp Gateway if configured in environment
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    const ultramsgInstance = process.env.ULTRAMSG_INSTANCE_ID;
    const ultramsgToken = process.env.ULTRAMSG_TOKEN;
    const callmebotApiKey = process.env.CALLMEBOT_API_KEY;

    let dispatchedVia = 'background-queue';

    if (ultramsgInstance && ultramsgToken) {
      const ultraUrl = `https://api.ultramsg.com/${ultramsgInstance}/messages/chat`;
      await fetch(ultraUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: ultramsgToken,
          to: `+${formattedPhone}`,
          body: message,
        }),
      });
      dispatchedVia = 'ultramsg';
    } else if (callmebotApiKey) {
      const callMeUrl = `https://api.callmebot.com/whatsapp.php?phone=${formattedPhone}&text=${encodeURIComponent(message)}&apikey=${callmebotApiKey}`;
      await fetch(callMeUrl);
      dispatchedVia = 'callmebot';
    } else if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          employeeName,
          tier,
          shiftId,
          message,
        }),
      });
      dispatchedVia = 'webhook';
    }

    return NextResponse.json({
      ok: true,
      dispatchedVia,
      phone: formattedPhone,
      shiftId,
      tier,
    });
  } catch (error) {
    console.error('Error in /api/notify-cedi:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
