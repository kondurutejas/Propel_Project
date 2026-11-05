"""
Propel Career — Job Scraping Service
Uses python-jobspy for LinkedIn/Indeed and a fallback demo scraper for Naukri.
"""

import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def scrape_jobs_from_portals(search_term='software intern', location='India', results_wanted=20):
    """
    Scrape jobs from multiple portals using python-jobspy.
    Falls back to demo data if scraping fails.
    
    Returns a list of dicts with job data.
    """
    jobs = []

    # --- Try python-jobspy (LinkedIn, Indeed, Glassdoor, Google) ---
    try:
        from jobspy import scrape_jobs

        logger.info(f"Scraping jobs: term='{search_term}', location='{location}'")

        df = scrape_jobs(
            site_name=["indeed", "linkedin", "glassdoor", "google"],
            search_term=search_term,
            location=location,
            results_wanted=results_wanted,
            hours_old=72,
            country_indeed='India' if 'india' in location.lower() else 'USA',
        )

        if df is not None and not df.empty:
            for _, row in df.iterrows():
                jobs.append({
                    'title': str(row.get('title', 'Untitled')),
                    'company': str(row.get('company_name', row.get('company', 'Unknown'))),
                    'location': str(row.get('location', location)),
                    'source': str(row.get('site', 'other')).lower(),
                    'url': str(row.get('job_url', row.get('link', ''))),
                    'salary': _format_salary(row),
                    'job_type': _detect_job_type(row),
                    'description': str(row.get('description', ''))[:20000],
                    'posted_date': _parse_date(row.get('date_posted')),
                })
            logger.info(f"Scraped {len(jobs)} jobs from jobspy")
    except ImportError:
        logger.warning("python-jobspy not installed. Using demo data.")
    except Exception as e:
        logger.error(f"JobSpy scraping error: {e}")

    # --- Try Naukri (lightweight scraper) ---
    try:
        naukri_jobs = scrape_naukri(search_term, location)
        jobs.extend(naukri_jobs)
        logger.info(f"Scraped {len(naukri_jobs)} jobs from Naukri")
    except Exception as e:
        logger.error(f"Naukri scraping error: {e}")

    # --- Fallback demo data if nothing was scraped ---
    if not jobs:
        logger.info("No jobs scraped. Using demo data.")
        jobs = get_demo_jobs(search_term, location)
        for job in jobs:
            job['is_demo'] = True

    return jobs


def scrape_naukri(search_term='software intern', location='India'):
    """
    Lightweight Naukri scraper using requests + BeautifulSoup.
    Scrapes the public job search page.
    """
    import requests
    from bs4 import BeautifulSoup

    jobs = []
    query = search_term.replace(' ', '-')
    url = f"https://www.naukri.com/{query}-jobs-in-{location.lower().replace(' ', '-')}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Naukri job cards (they use various class names)
        job_cards = soup.select('article.jobTuple, div.srp-jobtuple-wrapper, div.jobTuple')

        for card in job_cards[:10]:  # Limit to 10 results
            title_el = card.select_one('a.title, a.jobTitle, .title')
            company_el = card.select_one('.comp-name, .companyInfo a, .subTitle')
            location_el = card.select_one('.loc, .locWdth, .location')
            salary_el = card.select_one('.sal, .salary, .ni-salary')
            link_el = card.select_one('a.title, a.jobTitle')

            if title_el:
                jobs.append({
                    'title': title_el.get_text(strip=True),
                    'company': company_el.get_text(strip=True) if company_el else 'Unknown',
                    'location': location_el.get_text(strip=True) if location_el else location,
                    'source': 'naukri',
                    'url': link_el.get('href', '') if link_el else '',
                    'salary': salary_el.get_text(strip=True) if salary_el else '',
                    'job_type': 'internship' if 'intern' in search_term.lower() else 'full-time',
                    'description': '',
                    'posted_date': None,
                })
    except requests.exceptions.RequestException as e:
        logger.warning(f"Naukri request failed: {e}")
    except Exception as e:
        logger.error(f"Naukri parsing error: {e}")

    return jobs


def get_demo_jobs(search_term='software', location='India'):
    """Fallback demo jobs when scrapers aren't available."""
    return [
        {'title':'Backend Engineering Intern','company':'Example Software Team','location':'Bengaluru, India',
         'source':'sample','url':'','salary':'Not specified','job_type':'internship',
         'description':'Sample only. Python, SQL, Git, REST API and Testing. This is not a verified vacancy.',
         'posted_date':None,'is_demo':True},
        {'title':'Data Science Intern','company':'Example Analytics Team','location':'Remote',
         'source':'sample','url':'','salary':'Not specified','job_type':'internship',
         'description':'Sample only. Python, Pandas, NumPy, Statistics, SQL and Machine Learning.',
         'posted_date':None,'is_demo':True},
    ]


# --- Helpers ---

def _format_salary(row):
    """Format salary from jobspy dataframe row."""
    min_sal = row.get('min_amount', None)
    max_sal = row.get('max_amount', None)
    currency = row.get('currency', '₹')

    if min_sal and max_sal:
        return f"{currency}{int(min_sal):,} - {currency}{int(max_sal):,}"
    elif min_sal:
        return f"{currency}{int(min_sal):,}+"
    elif max_sal:
        return f"Up to {currency}{int(max_sal):,}"
    return ''


def _detect_job_type(row):
    """Detect job type from jobspy row."""
    title = str(row.get('title', '')).lower()
    desc = str(row.get('description', '')).lower()

    if 'intern' in title or 'intern' in desc:
        return 'internship'
    elif 'part-time' in title or 'part time' in desc:
        return 'part-time'
    elif 'contract' in title or 'contract' in desc:
        return 'contract'
    return 'full-time'


def _parse_date(date_val):
    """Parse date from various formats."""
    if date_val is None:
        return None
    if isinstance(date_val, datetime):
        return date_val.date()
    try:
        return datetime.strptime(str(date_val), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None
