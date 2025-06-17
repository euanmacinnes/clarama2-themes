let permission = Notification.permission;

function notification(title, body, icon) {
    if (permission === "granted") {
        showNotification(title, body);
    } else if (permission === "default") {
        requestAndShowPermission();
    } else {
        alert(title + ': ' + body);
    }
}

function requestAndShowPermission() {
    Notification.requestPermission(function (permission) {
        if (permission === "granted") {
            showNotification();
        }
    });
}

function showNotification(title, body, icon) {
    //  if(document.visibilityState === "visible") {
    //      return;
    //  }
    let notification = new Notification(title, {body, icon});

    notification.onclick = () => {
        notification.close();
        window.parent.focus();
    }

}

function getRelativeTime(date) {
    const diffMs = new Date() - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
 
    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
    return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
}

var hasUnseenDanger = false;
function flash(message, category = "info") {
    const now = new Date();
    const relativeTime = getRelativeTime(now);


    html = '<div class="row alert flash-alert alert-' + category + '">' + message + '</div>'
    $("#notification_popup").append(html);

    const alert_html = `
        <li class="list-group-item d-flex flex-row align-items-start justify-content-left border-0 pb-1" data-timestamp="${now.toISOString()}">
            <div class="d-flex flex-column flex-shrink-0 text-center m-0 px-2 py-1 alert alert-${category}" style="width: 68px;">
                ${category}
            </div>
            <div class="d-flex flex-column ps-2 text-wrap w-100">
                ${message}
                <small class="text-white-50 fst-italic" style="font-size: 11px;">${relativeTime}</small>
            </div>
        </li>
    `;

    $("#alerts").prepend(alert_html);
    $("#alertsmenu").removeClass("hidden");
    const $bellIcon = $('#alertsmenu i.bi');

    if (category === 'danger') {
        hasUnseenDanger = true;
        $bellIcon.addClass('shaking');
    } else {
        if (!hasUnseenDanger) {
            $bellIcon.removeClass('shaking');
        }
    }

    $(".flash-alert").delay(3200).fadeOut(300);
    console.log(`${category}: ${message}`);
}

setInterval(() => {
    $("#alerts li").each(function () {
        const timestamp = $(this).data("timestamp");
        if (!timestamp) return;
 
        const date = new Date(timestamp);
        const relativeTime = getRelativeTime(date);
        $(this).find("small").text(relativeTime);
    });
}, 60000);