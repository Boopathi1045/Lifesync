export function getISTDateInfo(date?: Date | number | string) {
    const inputDate = date ? new Date(date) : new Date();
    // Get the localized date/time string in IST
    const istString = inputDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);

    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    return {
        istDate,
        todayStr,
        hour: istDate.getHours(),
        minute: istDate.getMinutes(),
        // Format as HH:mm 
        timeStr: `${String(istDate.getHours()).padStart(2, '0')}:${String(istDate.getMinutes()).padStart(2, '0')}`
    };
}
