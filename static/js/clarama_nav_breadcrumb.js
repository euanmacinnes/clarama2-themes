// to handle long breadcrumb navigation

document.addEventListener('DOMContentLoaded', function () {
    const breadcrumbList = document.querySelector(".root-nav");
    const breadcrumbItems = Array.from(breadcrumbList.querySelectorAll(".nav-item"));
    // console.log("breadcrumbItems", breadcrumbItems);
    // console.log("breadcrumbItems length", breadcrumbItems.length);
    const maxItems = 4;

    if (breadcrumbItems.length > maxItems) {
        const first = breadcrumbItems[0]; 
        const keepCount = maxItems - 2; // num of trailing items to keep
        const lastItems = breadcrumbItems.slice(-keepCount);
        const middleItems = breadcrumbItems.slice(1, -keepCount); // items to collapse

        // create ellipsis w list of collapsed items
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "nav-item breadcrumb-ellipsis d-flex align-items-center";
        ellipsisLi.innerHTML = `
            <i class="nav-link bi bi-chevron-right p-0"></i>
            <span class="nav-link px-2">...</span>
            <ul class="hidden-items list-unstyled m-0 py-0 px-2">
                ${middleItems.map((item, index) => {
                    console.log("claram_favs item", item)
                    const clone = item.cloneNode(true); // deep copy which will clone elements n all of its child elements
                    if (index === 0) { // so that itll not display the '>' 
                        const icon = clone.querySelector('i');
                        if (icon) icon.remove();
                    }
                    return `<li class="d-flex flex-row align-items-center">${clone.innerHTML}</li>`;
                }).join('')}
            </ul>
        `;
    
        breadcrumbList.innerHTML = "";
        breadcrumbList.appendChild(first);
        breadcrumbList.appendChild(ellipsisLi);
        lastItems.forEach(item => breadcrumbList.appendChild(item));    
    }
});