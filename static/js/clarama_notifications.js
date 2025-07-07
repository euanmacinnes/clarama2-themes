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

    if (category == "crticial") {
        const nModal = document.getElementById("notifModalBody");
        nModal.innerHTML = '';
        nModal.innerHTML = `<p>${message}</p>`;

        $('#notifModal').modal('show');
    } else {
        const toastId = 'toast_' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast text-dark bg-${category}-subtle border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body w-100 py-3 px-4" style="word-break: break-word;">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-dark me-2 mt-2" style="font-size: 8px;" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        
        $('#toast_container').append(toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const bsToast = new bootstrap.Toast(toastElement, { delay: 5000 }); 
        bsToast.show();
        
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove(); 
        });
        
        // html = '<div class="row alert flash-alert alert-' + category + '">' + message + '</div>'
        // $("#notification_popup").append(html);
    }

    const alert_html = `
        <li class="list-group-item d-flex flex-row align-items-start justify-content-left border-0 pb-1" data-timestamp="${now.toISOString()}">
            <div class="d-flex flex-column flex-shrink-0 text-center m-0 px-2 py-1 alert alert-${category}" style="width: 68px;">
                ${category}
            </div>
            <div class="d-flex flex-column ps-2 text-wrap w-100" style="word-break: break-word;">
                ${message}
                <small class="text-white-50 fst-italic" style="font-size: 11px;">${relativeTime}</small>
            </div>
        </li>
    `;

    $("#alerts").prepend(alert_html);
    $("#alertsmenu").removeClass("hidden");
    const $bellIcon = $('#alertsmenu i.bi');
    hasUnseenDanger = true;
    $bellIcon.addClass('shaking');

    if (category === 'danger') {
        // hasUnseenDanger = true;
        // $bellIcon.addClass('shaking');
        $bellIcon.addClass('danger');
    } else {
        if (!hasUnseenDanger) {
            $bellIcon.removeClass('shaking');
            $bellIcon.removeClass('danger');
        }
    }

    $(".flash-alert").delay(5000).fadeOut(300);
    console.log(`${category}: ${message}`);
}

window.addEventListener('scroll', function () {
    const toastContainer = document.getElementById('toast_container');
    const scrollY = window.scrollY;
   
    if (scrollY > 10) {
      toastContainer.style.top = '12px';
    } else {
      toastContainer.style.top = '80px';
    }
});

setInterval(() => {
    $("#alerts li").each(function () {
        const timestamp = $(this).data("timestamp");
        if (!timestamp) return;
 
        const date = new Date(timestamp);
        const relativeTime = getRelativeTime(date);
        $(this).find("small").text(relativeTime);
    });
}, 60000);